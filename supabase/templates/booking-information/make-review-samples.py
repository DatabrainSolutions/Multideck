"""Create fictional Booking confirmation preview data for every MVP journey."""

import json
from copy import deepcopy
from pathlib import Path


OUTPUT = Path(__file__).with_name("samples")
OUTPUT.mkdir(exist_ok=True)

ROUTES = {
    "air": {
        "import": [("New York JFK", "London Heathrow")],
        "export": [("London Heathrow", "New York JFK")],
        "cross-trade": [("Dubai DXB", "Singapore Changi")],
    },
    "sea": {
        "import": [("Shanghai", "Felixstowe")],
        "export": [("Southampton", "Rotterdam")],
        "cross-trade": [("Rotterdam", "Jebel Ali"), ("Jebel Ali", "Singapore")],
    },
    "road": {
        "import": [("Lyon", "Birmingham")],
        "export": [("Birmingham", "Berlin")],
        "cross-trade": [("Lyon", "Brussels"), ("Brussels", "Berlin")],
    },
    "rail": {
        "import": [("Warsaw terminal", "Birmingham terminal")],
        "export": [("Birmingham terminal", "Berlin terminal")],
        "cross-trade": [("Warsaw terminal", "Berlin terminal"), ("Berlin terminal", "Rotterdam terminal")],
    },
}

for mode, directions in ROUTES.items():
    for direction, legs in directions.items():
        route = [
            {
                "mode": mode.upper(),
                "origin": origin,
                "destination": destination,
                "plannedDepartureAt": f"2026-10-{8 + index:02d}T09:00:00Z",
                "plannedArrivalAt": f"2026-10-{9 + index:02d}T14:00:00Z",
            }
            for index, (origin, destination) in enumerate(legs)
        ]
        sample = {
            "meta": {"schemaVersion": 2},
            "customer": {"name": "Example Customer Ltd"},
            "bookingConfirmation": {
                "bookingReference": f"DEMO-{mode.upper()}-{direction.upper()}",
                "direction": direction.title() if direction != "cross-trade" else "Cross-trade",
                "customerReference": f"PO-{mode.upper()}-001",
                "preparedBy": "Demo Operator",
                "provisional": False,
                "shipper": {"name": "Example Shipper Ltd", "address": "1 Sample Road, Example City"},
                "consignee": {"name": "Example Receiver Ltd", "address": "2 Sample Street, Destination City"},
                "scope": {"collection": True, "mainTransport": True, "delivery": True},
                "collection": {
                    "address": "1 Sample Road, Example City",
                    "plannedAtLabel": "07 Oct 2026",
                    "remarks": "Collect during normal opening hours.",
                },
                "mainTransport": route,
                "delivery": {
                    "address": "2 Sample Street, Destination City",
                    "plannedAtLabel": "12 Oct 2026",
                    "remarks": "Book a delivery slot.",
                },
                "cargo": [
                    {"description": "Demo machinery parts", "marksAndNumbers": "DEMO-01", "packages": 3,
                     "packageType": "Cartons", "grossWeightKg": 245.5},
                    {"description": "Demo spare components", "marksAndNumbers": "DEMO-02", "packages": 2,
                     "packageType": "Pallets", "grossWeightKg": 180},
                ],
                "specialInstructions": "This is fictional preview data; do not dispatch.",
                "priceStatus": "confirmed",
                "chargeLines": [
                    {"description": "Freight", "currency": "GBP", "sellAmount": 1250},
                    {"description": "Handling", "currency": "GBP", "sellAmount": 85},
                    {"description": "Destination service", "currency": "EUR", "sellAmount": 110},
                ],
                "chargeTotals": [
                    {"currency": "EUR", "amount": 110},
                    {"currency": "GBP", "amount": 1335},
                ],
            },
        }
        (OUTPUT / f"{mode}-{direction}.json").write_text(
            json.dumps(sample, indent=2, ensure_ascii=False) + "\n"
        )
        if mode == "sea" and direction == "export":
            stress = deepcopy(sample)
            details = stress["bookingConfirmation"]
            stress["customer"]["name"] = "Example International Industrial Components and Equipment Distribution Limited"
            details["shipper"]["name"] = "Example International Industrial Components and Equipment Distribution Limited"
            details["cargo"] = [
                {"description": f"Fictional machinery component line {index:02d} with a longer description",
                 "marksAndNumbers": f"DEMO-{index:03d}", "packages": index,
                 "packageType": "Cartons", "grossWeightKg": index * 12.5}
                for index in range(1, 36)
            ]
            (OUTPUT / "stress-multi-page.json").write_text(
                json.dumps(stress, indent=2, ensure_ascii=False) + "\n"
            )
            provisional = deepcopy(sample)
            provisional["bookingConfirmation"].update(
                provisional=True, priceStatus="Price to be confirmed", chargeLines=[], chargeTotals=[]
            )
            provisional["bookingConfirmation"]["scope"]["delivery"] = False
            provisional["bookingConfirmation"]["delivery"] = None
            (OUTPUT / "provisional-partial-service.json").write_text(
                json.dumps(provisional, indent=2, ensure_ascii=False) + "\n"
            )

print(f"Wrote 14 fictional preview samples to {OUTPUT}")
