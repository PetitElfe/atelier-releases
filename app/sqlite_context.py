"""A transaction context that also closes its SQLite handle on every exit."""
from contextlib import contextmanager
import sqlite3
@contextmanager
def connect(*args,**kwargs):
 connection=sqlite3.connect(*args,**kwargs)
 try:
  with connection:yield connection
 finally:connection.close()
