"""Unit tests for keep_alive.py's pure parts.  python3 -m unittest discover skills/keep-alive/scripts"""
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from keep_alive import cache_share, is_due, plist_for, session_facts, tick_s  # noqa: E402


class KeepAlive(unittest.TestCase):
    def test_is_due_only_after_a_full_idle_interval(self):
        self.assertFalse(is_due(now=100 + 3299, last_touch=100, every_s=3300))
        self.assertTrue(is_due(now=100 + 3300, last_touch=100, every_s=3300))

    def test_cache_share(self):
        self.assertAlmostEqual(cache_share({"input_tokens": 2, "cache_read_input_tokens": 83162,
                                            "cache_creation_input_tokens": 1696}), 0.98, places=2)
        self.assertEqual(cache_share({}), 0.0)
        self.assertEqual(cache_share({"input_tokens": 90_000, "cache_read_input_tokens": 0}), 0.0)

    def test_tick_never_exceeds_the_ping_interval(self):
        self.assertEqual(tick_s(55), 300)
        self.assertEqual(tick_s(2), 120)

    def test_plist_runs_ping_silently(self):
        p = plist_for("abc", "/s/keep_alive.py", "/py", 55, "/l.log", "/bin")
        self.assertEqual(p["ProgramArguments"], ["/py", "/s/keep_alive.py", "ping", "abc"])
        self.assertEqual(p["StartInterval"], 300)
        self.assertEqual(p["EnvironmentVariables"]["HIGGS_TTS_ENABLED"], "0")
        self.assertFalse(p["RunAtLoad"])

    def test_session_facts_takes_first_cwd_and_last_real_model(self):
        lines = [
            json.dumps({"cwd": "/a"}),
            "not json",
            json.dumps({"cwd": "/b", "message": {"model": "claude-opus-5-5"}}),
            json.dumps({"message": {"model": "<synthetic>"}}),
            json.dumps({"message": "plain string"}),
        ]
        self.assertEqual(session_facts(lines), ("/a", "claude-opus-5-5"))


if __name__ == "__main__":
    unittest.main()
