from math import asin, cos, radians, sin, sqrt

from data import AIRCRAFT, AIRPORTS

EARTH_RADIUS_NM = 3440.065
TAXI_ALLOWANCE_H = 0.3
RESERVE_FACTOR = 1.10
WIND_LIMIT_KT = 50


def find(items, key, value):
    return next((i for i in items if i[key] == value), None)


def distance_nm(a, b):
    lat1, lon1, lat2, lon2 = map(radians, (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = sin((lat2 - lat1) / 2) ** 2 + cos(lat1) * cos(lat2) * sin((lon2 - lon1) / 2) ** 2
    return 2 * EARTH_RADIUS_NM * asin(sqrt(h))


def quote(aircraft_id, origin, dest, pax=1, headwind_kt=0, round_trip=False):
    ac = find(AIRCRAFT, "id", aircraft_id)
    a = find(AIRPORTS, "icao", origin)
    b = find(AIRPORTS, "icao", dest)
    if not ac:
        raise ValueError("Unknown aircraft")
    if not a or not b:
        raise ValueError("Unknown airport")
    if a is b:
        raise ValueError("Departure and destination must differ")
    if not 1 <= pax <= ac["seats"]:
        raise ValueError(f"Passengers must be between 1 and {ac['seats']}")
    if abs(headwind_kt) > WIND_LIMIT_KT:
        raise ValueError(f"Wind must be within ±{WIND_LIMIT_KT} kt")

    legs = 2 if round_trip else 1
    dist = distance_nm(a, b)
    gs = ac["cruise_kt"] - headwind_kt
    if gs < 40:
        raise ValueError("Headwind too strong for this aircraft")
    # Headwind applies on the outbound leg, tailwind on the return.
    hours = dist / gs
    if round_trip:
        hours += dist / (ac["cruise_kt"] + headwind_kt)
    hours += TAXI_ALLOWANCE_H * legs

    fuel_key = "fuel_100ll" if ac["fuel"] == "100LL" else "fuel_jeta"
    gallons = hours * ac["burn_gph"] * RESERVE_FACTOR
    fuel_cost = gallons * a[fuel_key]
    rental = hours * ac["rate_hr"]
    landing = b["landing_fee"] + (a["landing_fee"] if round_trip else 0)
    total = rental + fuel_cost + landing
    r = lambda x: round(x, 2)
    return {
        "aircraft": ac["name"], "origin": a["icao"], "destination": b["icao"],
        "distance_nm": round(dist), "hours": r(hours), "gallons": r(gallons),
        "lines": [
            {"label": "Aircraft rental", "amount": r(rental)},
            {"label": "Fuel (incl. 10% reserve)", "amount": r(fuel_cost)},
            {"label": "Landing fees", "amount": r(landing)},
        ],
        "total": r(total), "per_pax": r(total / pax),
    }
