from flask import Flask, jsonify, render_template, request

import pricing
from data import AIRCRAFT, AIRPORTS

app = Flask(__name__)


@app.get("/")
def index():
    return render_template("index.html", aircraft=AIRCRAFT, airports=AIRPORTS)


@app.get("/playground")
def playground():
    return render_template("playground.html")


@app.get("/api/catalog")
def catalog():
    return jsonify(aircraft=AIRCRAFT, airports=AIRPORTS)


@app.post("/api/quote")
def quote():
    body = request.get_json(silent=True) or {}
    try:
        result = pricing.quote(
            body.get("aircraft"), body.get("origin"), body.get("destination"),
            pax=int(body.get("pax", 1)),
            headwind_kt=float(body.get("headwind", 0)),
            round_trip=bool(body.get("round_trip", False)),
        )
    except (ValueError, TypeError) as e:
        return jsonify(error=str(e)), 400
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True)
