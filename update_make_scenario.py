#!/usr/bin/env python3
"""
Script to update Make.com scenario with webhook trigger and correct modules
Uses Make MCP to update scenario 4003851
"""

import json

# Read the blueprint
with open('final-blueprint.json', 'r') as f:
    blueprint = json.load(f)

# The blueprint needs to be passed to Make MCP
# This script shows the structure needed
print("Blueprint structure ready for Make MCP update:")
print(json.dumps(blueprint, indent=2))

# Note: The actual update would be done via Make MCP
# mcp_make_scenarios_update(
#     scenarioId=4003851,
#     blueprint=blueprint
# )
