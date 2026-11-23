import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Ruling (ledger): tests import main.py which opens the production duckdb cache file
# exclusively. When the dev backend is running, the import fails with an IO lock error.
# Redirect duckdb.connect to :memory: so tests run alongside a live backend.
# Cost if wrong: any future test needing real cached candle data gets an empty DB.
import duckdb as _duckdb

_real_connect = _duckdb.connect
_duckdb.connect = lambda *a, **k: _real_connect(":memory:")

from main import app  # noqa: E402
from mt5_service import mt5_service  # noqa: E402

# Ruling (ledger): the test machine has a REAL MT5 terminal connected
# (Exness-MT5Real25, live account). Without this, trade tests run the live
# branch and could place real orders. Force mock mode for all tests.
mt5_service.connected = False
