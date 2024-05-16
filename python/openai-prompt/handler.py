import json
import requests

# Function to handle requests
def handler(request):
    try:
        # Get JSON data from the request
        request_body = request.get_json(force=True, silent=True)
        
        # Extract required parameters from the request body
        prompt = request_body.get('prompt')
        max_tokens = request_body.get('max_tokens', 150)
        temperature = request_body.get('temperature', 0.7)
        model = request_body.get('model', 'gpt-3.5-turbo')
        token = request_body.get('token')

        # Validate input
        if not prompt or not isinstance(prompt, str):
            return {'error': 'Invalid prompt'}

        # Prepare request options
        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        }

        # Make HTTP request
        response_body = make_http_request(url, headers, json.dumps({
            'model': model,
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': max_tokens,
            'temperature': temperature
        }))

        # Parse the response body
        res_json = json.loads(response_body['body'])
        return res_json
    except Exception as e:
        # Handle exceptions
        return {'error': 'Internal Server Error'}

# Function to make HTTP request
def make_http_request(url, headers, body):
    response = requests.post(url, headers=headers, data=body)
    return {
        'status': response.status_code,
        'headers': response.headers,
        'body': response.text
    }
