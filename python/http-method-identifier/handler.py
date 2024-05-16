from flask import jsonify
import logging

def handler(request):
    try:
        # Determine the HTTP method
        method = request.method

        if method == 'GET':
            message = 'GET method called.'
        elif method == 'POST':
            message = 'POST method called.'
        elif method == 'PUT':
            message = 'PUT method called.'
        elif method == 'DELETE':
            message = 'DELETE method called.'
        elif method == 'PATCH':
            message = 'PATCH method called.'
        else:
            message = 'Unsupported method.'

        # Set the response JSON
        response_json = {'message': message}

        # Return the response JSON
        return jsonify(response_json)
    except Exception as error:
        logging.error(error)
        # Send an error response if needed
        return jsonify({
            "statusCode": 500,
            "headers": {"Content-Type": "text/plain"},
            "message": "Internal Server Error"
        })
