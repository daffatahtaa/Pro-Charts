from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_hiding_drawing_preserves_z_order():
    sym = "ZORDERTEST"
    client.delete(f"/api/drawings?symbol={sym}")

    # Create 3 drawings in order: A, B, C
    for idx, name in enumerate(["A_rect", "B_line", "C_fib"], start=1):
        res = client.post(
            "/api/drawings",
            json={
                "id": f"ztest_{name}",
                "symbol": sym,
                "timeframe": "15m",
                "name": "segment",
                "points": [{"value": 100.0 + idx}],
                "styles": {},
                "extendData": {"label": name},
                "locked": False,
                "visible": True,
            },
        )
        assert res.status_code == 200

    initial = client.get(f"/api/drawings?symbol={sym}").json()
    assert [d["id"] for d in initial] == ["ztest_A_rect", "ztest_B_line", "ztest_C_fib"]

    # Hide drawing A (first item)
    first = initial[0]
    first["visible"] = False
    res_hide = client.post("/api/drawings", json=first)
    assert res_hide.status_code == 200

    after_hide = client.get(f"/api/drawings?symbol={sym}").json()
    assert [d["id"] for d in after_hide] == ["ztest_A_rect", "ztest_B_line", "ztest_C_fib"]
    assert after_hide[0]["visible"] is False

    # Show drawing A again and lock it — still stays at index 0!
    first["visible"] = True
    first["locked"] = True
    client.post("/api/drawings", json=first)
    after_show = client.get(f"/api/drawings?symbol={sym}").json()
    assert [d["id"] for d in after_show] == ["ztest_A_rect", "ztest_B_line", "ztest_C_fib"]
    assert after_show[0]["visible"] is True and after_show[0]["locked"] is True

    client.delete(f"/api/drawings?symbol={sym}")
