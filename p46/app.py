import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend import create_app, db

app = create_app('development')

with app.app_context():
    db.app = app
    db.create_all()

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=9000)
