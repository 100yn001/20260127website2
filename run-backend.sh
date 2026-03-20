#!/bin/bash

echo "🚀 Starting YN Backend Server..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install dependencies
echo "Installing Python dependencies..."
pip install -q flask flask-cors xai-sdk elevenlabs pydub

# Check if environment variables are set
if [ -z "$XAI" ] || [ -z "$ELEVENLABS" ]; then
    echo "⚠️  ERROR: Environment variables not set!"
    echo "Please run:"
    echo "  export XAI='your-key'"
    echo "  export ELEVENLABS='your-key'"
    echo ""
    exit 1
fi

echo "✅ Found XAI and ELEVENLABS environment variables"
echo ""
echo "Starting server on http://localhost:5000"
echo ""

# Run the Flask server
python backend-starter.py
