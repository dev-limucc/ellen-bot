#!/usr/bin/env python3
"""Channel posting scheduler - picks random next post time"""
import json, random, datetime, os

STATE_FILE = os.path.expanduser("~/.openclaw/workspace/memory/channel-state.json")

def load_state():
    with open(STATE_FILE) as f:
        return json.load(f)

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def get_next_post_time():
    """Random interval between 30min and 24h, weighted toward active hours"""
    # Weight: 70% chance short gap (30min-4h), 30% chance long gap (4h-24h)
    if random.random() < 0.7:
        minutes = random.randint(30, 240)
    else:
        minutes = random.randint(240, 1440)
    
    # Sometimes burst: 15% chance of very short gap
    if random.random() < 0.15:
        minutes = random.randint(10, 60)
    
    now = datetime.datetime.now()
    next_time = now + datetime.timedelta(minutes=minutes)
    return next_time.isoformat()

if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "schedule":
        state = load_state()
        state["next_post_time"] = get_next_post_time()
        save_state(state)
        print(f"next post: {state['next_post_time']}")
    elif len(sys.argv) > 1 and sys.argv[1] == "check":
        state = load_state()
        if state.get("next_post_time"):
            next_t = datetime.datetime.fromisoformat(state["next_post_time"])
            if datetime.datetime.now() >= next_t:
                print("POST_NOW")
            else:
                diff = next_t - datetime.datetime.now()
                print(f"wait {int(diff.total_seconds()/60)}m")
        else:
            print("NO_SCHEDULE")
    elif len(sys.argv) > 1 and sys.argv[1] == "record":
        # record a post: python3 channel-scheduler.py record "youtube:abc123" "funny edit"
        state = load_state()
        content_id = sys.argv[2] if len(sys.argv) > 2 else "unknown"
        desc = sys.argv[3] if len(sys.argv) > 3 else ""
        state["last_post_time"] = datetime.datetime.now().isoformat()
        state["posted_content_ids"].append(content_id)
        state["post_history"].append({
            "date": datetime.datetime.now().isoformat(),
            "type": content_id.split(":")[0] if ":" in content_id else "unknown",
            "description": desc
        })
        # Schedule next
        state["next_post_time"] = get_next_post_time()
        save_state(state)
        print(f"recorded. next post: {state['next_post_time']}")
