from flask import request, jsonify
import requests

# Create a global HTTP session (which provides connection pooling)
session = requests.Session()

@app.route('/fetch-url', methods=['POST'])
def handler():
    """
    Function that uses a connection pool to make HTTP requests.
    Args:
        None (uses Flask's request object)
    Returns:
        JSON response with status message.
    """

    try:
        # Parse the JSON request body
        data = request.get_json()
        if not data or 'url' not in data:
            return jsonify({'error': 'URL is required'}), 400

        url = data['url']

        # Make an HTTP GET request using the provided URL
        response = session.get(url)
        response.raise_for_status()

        # Return success message
        return jsonify({'message': 'Success!'}), 200

    except requests.exceptions.RequestException as e:
        # Handle any errors that occur during the HTTP request
        return jsonify({'error': 'Error making request', 'details': str(e)}), 500
