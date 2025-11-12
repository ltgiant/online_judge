import os
from psycopg2.pool import SimpleConnectionPool
from dotenv import load_dotenv

load_dotenv()

PG_DSN = f"dbname={os.getenv('POSTGRES_DB')} user={os.getenv('POSTGRES_USER')} password={os.getenv('POSTGRES_PASSWORD')} host={os.getenv('POSTGRES_HOST')} port={os.getenv('POSTGRES_PORT')}"

pool = SimpleConnectionPool(minconn=1, maxconn=10, dsn=PG_DSN)

class DB:
    def __enter__(self):
        self.conn = pool.getconn()
        self.cur = self.conn.cursor()
        return self.cur
    def __exit__(self, exc_type, exc, tb):
        if exc:
            self.conn.rollback()
        else:
            self.conn.commit()
        self.cur.close()
        pool.putconn(self.conn)