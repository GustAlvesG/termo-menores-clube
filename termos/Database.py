import pyodbc

class Database():
    def __init__(self, driver, server, database, user, password):
        self.driver = driver
        self.server = server
        self.database = database
        self.user = user
        self.password = password

    def connect(self):
        self.conn = pyodbc.connect(
            f'DRIVER={{{self.driver}}};SERVER={self.server};DATABASE={self.database};'
            f'UID={self.user};PWD={self.password};Encrypt=no;',
            timeout=10,
        )
        self.cursor = self.conn.cursor()

    def disconnect(self):
        self.cursor.close()
        self.conn.close()

    def select(self, fields, table, condition, params=()):
        """SELECT com parâmetros: use '?' na condição e passe os valores em params.

        Ex.: db.select('Id', 'dbo.Titles', 'Code = ?', (matricula,))
        Nunca concatene valores digitados pelo usuário em 'condition'.
        """
        self.connect()
        try:
            self.cursor.execute(f"SELECT {fields} FROM {table} WHERE {condition}", *params)
            return self.cursor.fetchall()
        finally:
            self.disconnect()

    def update(self, table, fields, values, condition, params=()):
        self.connect()
        try:
            self.cursor.execute(f"UPDATE {table} SET {fields} = {values} WHERE {condition}", *params)
            self.conn.commit()
        finally:
            self.disconnect()

    def insert(self, table, fields, values, params=()):
        self.connect()
        try:
            self.cursor.execute(f"INSERT INTO {table} ({fields}) VALUES ({values})", *params)
            self.conn.commit()
        finally:
            self.disconnect()

    def delete(self, table, condition, params=()):
        self.connect()
        try:
            self.cursor.execute(f"DELETE FROM {table} WHERE {condition}", *params)
            self.conn.commit()
        finally:
            self.disconnect()
