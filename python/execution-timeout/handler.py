from flask import jsonify
import time

def handler(request):
    try:
        print("Starting execution...")
        time.sleep(1)  # Delay for 1 second
        print("Execution resumed after delay.")
        return jsonify({'message': 'Function executed with intentional delay.'})
    except Exception as e:
        print(f"Error: {e}")
        return jsonify({
            "statusCode": 500,
            "headers": {"Content-Type": "text/plain"},
            "message": "Internal Server Error"
        })
