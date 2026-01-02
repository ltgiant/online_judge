import os
from psycopg2.pool import SimpleConnectionPool
from dotenv import load_dotenv

load_dotenv()

PG_SSLMODE = os.getenv("PG_SSLMODE", "require")  # Azure Postgres usually needs SSL; set to 'disable' for local dev
PG_DSN = (
    f"dbname={os.getenv('POSTGRES_DB')} "
    f"user={os.getenv('POSTGRES_USER')} "
    f"password={os.getenv('POSTGRES_PASSWORD')} "
    f"host={os.getenv('POSTGRES_HOST')} "
    f"port={os.getenv('POSTGRES_PORT')} "
    f"sslmode={PG_SSLMODE}"
)

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
