"""Ponto de entrada usado para empacotar a aplicação em um .exe com PyInstaller.

Ao rodar o .exe gerado, o servidor web sobe na porta definida em APP_PORT (padrão 8501).
As pastas 'templates/', 'output/' e 'logs/' e o arquivo '.env' ficam ao lado do .exe.
"""
from servidor import main

if __name__ == "__main__":
    main()
