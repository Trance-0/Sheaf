import os
import json
import logging
import uuid
import yaml
import requests
import psycopg2
from datetime import datetime
from psycopg2.extras import RealDictCursor

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("SheafPipeline")

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
DATABASE_URL = os.environ.get("DATABASE_URL")
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "openai/gpt-3.5-turbo") # Default to a free or low-cost model, user customizable

def load_prompts():
    path = os.path.join(os.path.dirname(__file__), "..", "..", "config", "prompts.yaml")
    with open(path, "r") as f:
        return yaml.safe_load(f)

def connect_db():
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL environment variable is missing.")
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)

def get_openrouter_assessment(prompts, event_data):
    if not OPENROUTER_API_KEY:
        logger.warning("OPENROUTER_API_KEY missing, skipping LLM evaluation.")
        return None

    system_prompt = prompts.get("system_prompt", "")
    user_prompt = prompts.get("user_prompt_template", "").format(
        title=event_data["title"],
        date=event_data["date"],
        description=event_data["description"],
        articles=json.dumps(event_data["articles"], indent=2),
        entities=", ".join(event_data["entities"])
    )

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "HTTP-Referer": "https://github.com/SheafProject",  # Required by OpenRouter
        "X-Title": "Sheaf Local Pipeline",
        "Content-Type": "application/json"
    }

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": "Return only raw JSON. " + user_prompt}
        ]
    }

    resp = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
    resp.raise_for_status()

    result_text = resp.json()["choices"][0]["message"]["content"]

    # Simple cleanup for JSON tags
    result_text = result_text.strip()
    if result_text.startswith("```json"):
        result_text = result_text[7:]
    if result_text.endswith("```"):
        result_text = result_text[:-3]

    try:
        return json.loads(result_text)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON from LLM: {result_text}")
        return None

def process_mock_events():
    # In a real implementation we would fetch RSS or GDELT here.
    return [{
        "title": "Major API Regulatory Shift",
        "date": datetime.utcnow().isoformat(),
        "description": "The SEC announced a wide framework over API governance.",
        "articles": [
            {"title": "SEC API Framework", "url": "https://example.com/sec", "publishedAt": datetime.utcnow().isoformat()}
        ],
        "entities": ["SEC", "Microsoft", "Google"]
    }]

def save_to_db(conn, event_data, assessment):
    with conn.cursor() as cur:
        # Create Event
        event_id = str(uuid.uuid4())
        cur.execute("""
            INSERT INTO "Event" (id, title, date, description, "createdAt")
            VALUES (%s, %s, %s, %s, %s)
            ON CONFLICT (id) DO NOTHING;
        """, (event_id, event_data["title"], event_data["date"], event_data["description"], datetime.utcnow()))

        # Create Articles
        for art in event_data["articles"]:
            art_id = str(uuid.uuid4())
            cur.execute("""
                INSERT INTO "Article" (id, url, title, "publishedAt", "eventId")
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (url) DO NOTHING;
            """, (art_id, art["url"], art["title"], art["publishedAt"], event_id))

        if not assessment:
            conn.commit()
            return

        # Create Entities and EventEntity mapping
        for ent_data in assessment.get("entities", []):
            ent_name = ent_data.get("entityName")
            if not ent_name: continue

            ent_id = ent_name.lower().replace(" ", "-")

            cur.execute("""
                INSERT INTO "Entity" (id, name, type, "updatedAt")
                VALUES (%s, %s, 'topic', %s)
                ON CONFLICT (id) DO NOTHING;
            """, (ent_id, ent_name, datetime.utcnow()))

            impact = ent_data.get("impact", {})
            cur.execute("""
                INSERT INTO "EventEntity" (id, "eventId", "entityId", "impactScore5d", "impactScore5w", "impactScore5m", "impactScore5y")
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ON CONSTRAINT "EventEntity_eventId_entityId_key" DO NOTHING;
            """, (
                str(uuid.uuid4()), event_id, ent_id,
                int(impact.get("5d", {}).get("score", 0)),
                int(impact.get("5w", {}).get("score", 0)),
                int(impact.get("5m", {}).get("score", 0)),
                int(impact.get("5y", {}).get("score", 0)),
            ))

        # Cache Card for the Event
        cur.execute("""
            INSERT INTO "CacheCard" (id, type, "eventId", content, "updatedAt")
            VALUES (%s, 'edge-card', %s, %s, %s)
        """, (str(uuid.uuid4()), event_id, json.dumps(assessment), datetime.utcnow()))

        conn.commit()
        logger.info(f"Successfully inserted Event {event_id} and generated cache card.")


def main():
    logger.info("Starting Data Pipeline...")
    prompts = load_prompts()

    events = process_mock_events()

    conn = None
    try:
        conn = connect_db()
        for ev in events:
            logger.info(f"Evaluating: {ev['title']}")
            assessment = get_openrouter_assessment(prompts, ev)
            save_to_db(conn, ev, assessment)
    except Exception as e:
        logger.error(f"Pipeline error: {e}")
        if conn:
            conn.rollback()
        raise
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
