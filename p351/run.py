from backend.app import socketio, app
import os

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Starting PostgreSQL Logical Replication Simulator on port {port}...")
    socketio.run(app, host="0.0.0.0", port=port, debug=True)
