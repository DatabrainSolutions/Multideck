begin;

-- Repair only the provider-facing schema. The action, permissions, approval,
-- version checks and deterministic deal watches remain unchanged.
update public."sys_AIDexterActions"
set "AIDexterAction_ParametersJSON" = jsonb_set(
  "AIDexterAction_ParametersJSON", '{properties,input}',
  $input_schema${
  "anyOf": [
    {
      "type": "object",
      "description": "set_next_action: prepare a named action with an eligible assignee and due date.",
      "properties": {
        "title": {
          "type": "string"
        },
        "type": {
          "type": "string",
          "enum": [
            "call",
            "email",
            "meeting",
            "quote",
            "follow_up",
            "other"
          ]
        },
        "ownerId": {
          "type": "string"
        },
        "dueAt": {
          "type": "string"
        },
        "taskDate": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "title",
        "type",
        "ownerId",
        "dueAt",
        "taskDate"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "complete_next_action: complete the exact current action, with an optional outcome.",
      "properties": {
        "actionId": {
          "type": "string"
        },
        "note": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "actionId",
        "note"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "assign: change only the deal owner. The main contact is unchanged.",
      "properties": {
        "ownerId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "ownerId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "assign: change only the main contact. The deal owner is unchanged.",
      "properties": {
        "primaryContactId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "primaryContactId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "assign: change both assignments only when both changes were requested. Null explicitly clears an assignment.",
      "properties": {
        "ownerId": {
          "type": [
            "string",
            "null"
          ]
        },
        "primaryContactId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "ownerId",
        "primaryContactId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "mark_lost: record the requested loss reason; use null for optional details not supplied.",
      "properties": {
        "reasonCode": {
          "type": "string",
          "enum": [
            "price",
            "timing",
            "competitor",
            "service_fit",
            "no_response",
            "cancelled",
            "other"
          ]
        },
        "details": {
          "type": [
            "string",
            "null"
          ]
        },
        "competitor": {
          "type": [
            "string",
            "null"
          ]
        },
        "revisitDate": {
          "type": [
            "string",
            "null"
          ]
        },
        "pipelineStageId": {
          "type": [
            "string",
            "null"
          ]
        }
      },
      "required": [
        "reasonCode",
        "details",
        "competitor",
        "revisitDate",
        "pipelineStageId"
      ],
      "additionalProperties": false
    },
    {
      "type": "object",
      "description": "reopen: use the verified open stage from this deal pipeline and the requested reopening reason.",
      "properties": {
        "pipelineStageId": {
          "type": "string"
        },
        "reason": {
          "type": "string"
        }
      },
      "required": [
        "pipelineStageId",
        "reason"
      ],
      "additionalProperties": false
    }
  ]
}$input_schema$::jsonb
), "AIDexterAction_UpdatedAt" = now()
where "AIDexterAction_Code" = 'update_deal_sales';

do $verify$
begin
  if not exists (select 1 from public."sys_AIDexterActions"
    where "AIDexterAction_Code" = 'update_deal_sales'
    and jsonb_array_length("AIDexterAction_ParametersJSON" #> '{properties,input,anyOf}') = 7) then
    raise exception 'The Dexter deal sales schema could not be updated.';
  end if;
end
$verify$;

commit;
