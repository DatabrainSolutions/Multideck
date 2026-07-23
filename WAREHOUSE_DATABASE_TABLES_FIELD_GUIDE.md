# Warehouse Database Tables And Field Guide

Extracted from `MULTIDECK_DATABASE_TABLES_FIELD_GUIDE.md`.

Original source file was not modified.

Included scope: Warehouse module, Warehouse Management System (WMS) module, warehouse/WMS lookup rows, `sys_Warehouse_LocationTypes`, and WMS read-model views.

## Shared Supabase Document Catalogue

Binary files are stored in private Supabase Storage buckets. PostgreSQL stores the authoritative
business link and audit metadata in `DOC_StoredObjects`; signed URLs are temporary and are never
stored. Warehouse documents keep their workflow rows in `WMS_Documents` and
`Portal_FileUploads`, whose storage bucket/path fields contain the Supabase bucket/object path.

### `DOC_StoredObjects`

Function: Canonical metadata catalogue for Supabase Storage objects used by warehouse, jobs, customs,
finance, communications, generated documents and processing concerns.

| Field | Purpose | Required | Key / Relation |
|---|---|---:|---|
| `DOCStoredObject_ID` | Stable document object ID. | Yes | PK |
| `DOCStoredObject_ConcernCode` | Storage/business concern such as `warehouse`, `jobs` or `finance`. | Yes | Indexed scope |
| `DOCStoredObject_OrganisationID` | Customer organisation owning the document, when applicable. | No | FK -> `Org_Master.Org_ID` |
| `DOCStoredObject_AggregateType` | Parent record type, for example `warehouse-order`. | Yes | Indexed scope |
| `DOCStoredObject_AggregateID` | Parent business record ID. | Yes | Indexed scope |
| `DOCStoredObject_ProviderCode` | Storage provider; currently `supabase_storage`. | Yes |  |
| `DOCStoredObject_Container` | Private Supabase bucket name; legacy column name retained for compatibility. | Yes | Unique with object path |
| `DOCStoredObject_BlobName` | Full versioned object path; legacy column name retained for compatibility. | Yes | Unique with bucket |
| `DOCStoredObject_OriginalFileName` | User-facing filename retained outside the blob key. | Yes |  |
| `DOCStoredObject_MimeType` | Validated content type. | Yes |  |
| `DOCStoredObject_FileSizeBytes` | Uploaded binary size. | Yes |  |
| `DOCStoredObject_SHA256` | Integrity/deduplication checksum. | Yes | Indexed |
| `DOCStoredObject_ETag` | Provider object concurrency token when supplied. | No |  |
| `DOCStoredObject_VersionID` | Provider object identifier when supplied. | No |  |
| `DOCStoredObject_StatusCode` | Storage lifecycle: `active`, `quarantined` or `deleted`. | Yes | Check constraint |
| `DOCStoredObject_CreatedAt` | Upload timestamp. | Yes |  |
| `DOCStoredObject_CreatedBy` | Internal user who uploaded the file. | No | FK -> `cmp_Users.User_ID` |
| `DOCStoredObject_CreatedByPortalUserID` | Portal user who uploaded the file. | No | FK -> `Portal_Users.PortalUser_ID` |
| `DOCStoredObject_DeletedAt` | Soft-deletion timestamp. | No |  |
| `DOCStoredObject_DeletedBy` | Internal user who deleted the object. | No | FK -> `cmp_Users.User_ID` |

## Warehouse Schema Coverage

| Module | Tables |
|---|---:|
| Warehouse | 11 |
| Warehouse Management System (WMS) | 104 |

## Warehouse Lookup And Enum Summary

| Table | Rows | Code Column | Label Column | Sample Values |
|---|---:|---|---|---|
| `sys_Warehouse_LocationTypes` | 0 | `id` | `WHLT_Desc` |  |
| `sys_WMSAdjustmentStatuses` | 0 | `WMSAdjustmentStatus_Code` | `WMSAdjustmentStatus_Name` | `draft = Draft`, `pending_approval = Pending approval`, `approved = Approved`, `posted = Posted`, `rejected = Rejected`, `cancelled = Cancelled` |
| `sys_WMSAIInsightTypes` | 0 | `WMSAIInsightType_Code` | `WMSAIInsightType_Name` | `slotting = Slotting`, `exception_root_cause = Exception root cause`, `release_risk = Release risk`, `stock_accuracy = Stock accuracy`, `ageing = Ageing stock`, `billing_risk = Billing risk`, `customer_service = Customer service`, `kpi = KPI improvement` |
| `sys_WMSBillingBasis` | 0 | `WMSBillingBasis_Code` | `WMSBillingBasis_Name` | `per_order = Per order`, `per_line = Per line`, `per_pallet = Per pallet`, `per_carton = Per carton`, `per_unit = Per unit`, `per_kg = Per kg`, `per_cbm = Per CBM`, `per_day = Per day`, `per_week = Per week`, `per_month = Per month`, `flat = Flat` |
| `sys_WMSBillingStatuses` | 0 | `WMSBillingStatus_Code` | `WMSBillingStatus_Name` | `draft = Draft`, `ready = Ready`, `exported = Exported`, `cancelled = Cancelled` |
| `sys_WMSBondedDiscrepancyTypes` | 0 | `WMSBondedDiscrepancyType_Code` | `WMSBondedDiscrepancyType_Name` | `over = Over`, `short = Short`, `damage = Damage`, `wrong_status = Wrong customs status`, `wrong_location = Wrong location`, `documentation = Documentation issue`, `reconciliation = Reconciliation issue` |
| `sys_WMSBondedMovementTypes` | 0 | `WMSBondedMovementType_Code` | `WMSBondedMovementType_Name` | `admission = Admission`, `internal_move = Internal move`, `status_change = Status change`, `usual_handling = Usual handling`, `temporary_removal = Temporary removal`, `return_from_temporary_removal = Return from temporary removal`, `withdrawal = Withdrawal/removal`, `destruction = Destruction` |
| `sys_WMSBondedProcedureTypes` | 0 | `WMSBondedProcedureType_Code` | `WMSBondedProcedureType_Name` | `customs_warehousing = Customs warehousing`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspension = Excise suspension`, `free_circulation = Free circulation`, `re_export = Re-export`, `destruction = Destruction` |
| `sys_WMSBondedRemovalTypes` | 0 | `WMSBondedRemovalType_Code` | `WMSBondedRemovalType_Name` | `free_circulation = Release to free circulation`, `re_export = Re-export`, `transfer_to_bonded = Transfer to bonded warehouse`, `inward_processing = Discharge to inward processing`, `temporary_removal = Temporary removal`, `destruction = Destruction`, `other = Other` |
| `sys_WMSBondedWarehouseTypes` | 0 | `WMSBondedWarehouseType_Code` | `WMSBondedWarehouseType_Name` | `public_customs_warehouse = Public customs warehouse`, `private_customs_warehouse = Private customs warehouse`, `free_zone = Free zone`, `excise_warehouse = Excise warehouse`, `us_class_3 = US Class 3`, `us_class_4 = US Class 4`, `us_class_9 = US Class 9`, `other = Other` |
| `sys_WMSCustomsStatuses` | 0 | `WMSCustomsStatus_Code` | `WMSCustomsStatus_Name` | `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` |
| `sys_WMSCycleCountStatuses` | 0 | `WMSCycleCountStatus_Code` | `WMSCycleCountStatus_Name` | `planned = Planned`, `in_progress = In progress`, `variance_review = Variance review`, `approved = Approved`, `posted = Posted`, `cancelled = Cancelled` |
| `sys_WMSExceptionTypes` | 0 | `WMSExceptionType_Code` | `WMSExceptionType_Name` | `over = Over receipt`, `short = Short receipt`, `damage = Damage`, `wrong_item = Wrong item`, `wrong_location = Wrong location`, `temperature_breach = Temperature breach`, `customs_issue = Customs issue`, `compliance_issue = Compliance issue`, `credit_hold = Credit hold`, `system_error = System error` |
| `sys_WMSFacilityCapabilities` | 0 | `WMSCapability_Code` | `WMSCapability_Name` | `bonded_storage = Bonded storage`, `excise_storage = Excise storage`, `dangerous_goods = Dangerous goods`, `cold_chain = Cold chain`, `pharma = Pharma`, `food = Food`, `ecommerce_fulfilment = E-commerce fulfilment`, `crossdock = Cross-dock`, `container_devanning = Container devanning`, `customs_inspection = Customs inspection`, `value_added_services = Value-added services` |
| `sys_WMSFacilityTypes` | 0 | `WMSFacilityType_Code` | `WMSFacilityType_Name` | `freight_warehouse = Freight warehouse`, `third_party_logistics = 3PL warehouse`, `fulfilment = Fulfilment centre`, `crossdock = Cross-dock`, `bonded_warehouse = Bonded/customs warehouse`, `free_zone = Free zone`, `cold_chain = Cold-chain warehouse`, `yard = Yard/depot` |
| `sys_WMSHandlingUnitTypes` | 0 | `WMSHUType_Code` | `WMSHUType_Name` | `pallet = Pallet`, `carton = Carton`, `case = Case`, `tote = Tote`, `container = Container`, `trailer = Trailer`, `parcel = Parcel`, `loose = Loose` |
| `sys_WMSHoldStatuses` | 0 | `WMSHoldStatus_Code` | `WMSHoldStatus_Name` | `open = Open`, `pending_release = Pending release`, `released = Released`, `cancelled = Cancelled` |
| `sys_WMSHoldTypes` | 0 | `WMSHoldType_Code` | `WMSHoldType_Name` | `customer = Customer hold`, `quality = Quality hold`, `damage = Damage hold`, `customs = Customs hold`, `bonded = Bonded hold`, `trade_compliance = Trade compliance hold`, `finance = Finance/credit hold`, `recall = Recall hold`, `system = System hold` |
| `sys_WMSIntegrationEventStatuses` | 0 | `WMSIntegrationStatus_Code` | `WMSIntegrationStatus_Name` | `pending = Pending`, `processing = Processing`, `completed = Completed`, `failed = Failed`, `ignored = Ignored`, `cancelled = Cancelled` |
| `sys_WMSInventoryStatuses` | 0 | `WMSInventoryStatus_Code` | `WMSInventoryStatus_Name` | `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` |
| `sys_WMSLocationStatuses` | 0 | `WMSLocationStatus_Code` | `WMSLocationStatus_Name` | `available = Available`, `occupied = Occupied`, `full = Full`, `blocked = Blocked`, `maintenance = Maintenance`, `customs_locked = Customs locked`, `inactive = Inactive` |
| `sys_WMSLocationTypes` | 0 | `WMSLocationType_Code` | `WMSLocationType_Name` | `bin = Bin`, `rack = Rack`, `floor = Floor`, `dock = Dock`, `staging = Staging`, `yard_slot = Yard slot`, `inspection = Inspection`, `virtual = Virtual` |
| `sys_WMSOrderLineStatuses` | 0 | `WMSOrderLineStatus_Code` | `WMSOrderLineStatus_Name` | `open = Open`, `allocated = Allocated`, `picked = Picked`, `received = Received`, `packed = Packed`, `dispatched = Dispatched`, `short = Short`, `cancelled = Cancelled` |
| `sys_WMSOrderStatuses` | 0 | `WMSOrderStatus_Code` | `WMSOrderStatus_Name` | `draft = Draft`, `booked = Booked`, `planned = Planned`, `in_progress = In progress`, `part_complete = Part complete`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` |
| `sys_WMSOrderTypes` | 0 | `WMSOrderType_Code` | `WMSOrderType_Name` | `inbound = Inbound receipt`, `outbound = Outbound release`, `transfer = Internal transfer`, `return = Return`, `crossdock = Cross-dock`, `adjustment = Stock adjustment`, `cycle_count = Cycle count`, `value_added_service = Value-added service`, `bonded_admission = Bonded admission`, `bonded_removal = Bonded removal`, `temporary_removal = Temporary removal`, `destruction = Destruction`, `inspection = Inspection` |
| `sys_WMSScanEventTypes` | 0 | `WMSScanEventType_Code` | `WMSScanEventType_Name` | `location_scan = Location scan`, `item_scan = Item scan`, `handling_unit_scan = Handling unit scan`, `serial_scan = Serial scan`, `seal_scan = Seal scan`, `mismatch = Mismatch`, `exception = Exception`, `photo = Photo` |
| `sys_WMSTaskStatuses` | 0 | `WMSTaskStatus_Code` | `WMSTaskStatus_Name` | `queued = Queued`, `assigned = Assigned`, `in_progress = In progress`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` |
| `sys_WMSTaskTypes` | 0 | `WMSTaskType_Code` | `WMSTaskType_Name` | `receive = Receive`, `putaway = Putaway`, `move = Move`, `pick = Pick`, `pack = Pack`, `dispatch = Dispatch`, `count = Count`, `inspection = Inspection`, `vas = Value-added service`, `admin = Administration` |
| `sys_WMSTransactionTypes` | 0 | `WMSTransactionType_Code` | `WMSTransactionType_Name` | `receipt = Receipt`, `putaway = Putaway`, `move = Move`, `adjustment_in = Adjustment in`, `adjustment_out = Adjustment out`, `dispatch = Dispatch`, `destruction = Destruction`, `return = Return`, `status_change = Status change`, `bonded_admission = Bonded admission`, `bonded_removal = Bonded removal` |
| `sys_WMSZoneTypes` | 0 | `WMSZoneType_Code` | `WMSZoneType_Name` | `bulk = Bulk storage`, `pick_face = Pick face`, `bonded = Bonded zone`, `quarantine = Quarantine`, `crossdock = Cross-dock`, `returns = Returns`, `dangerous_goods = Dangerous goods`, `cold_chain = Cold chain`, `dispatch = Dispatch`, `receiving = Receiving`, `yard = Yard`, `admin = Administration` |
| `sys_Warehouse_LocationTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for Warehouse Location Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSAIInsightTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSAIInsight Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSAdjustmentStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSAdjustment Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBillingBasis` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBilling Basis. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBillingStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBilling Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedDiscrepancyTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Discrepancy Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedMovementTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Movement Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedProcedureTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Procedure Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedRemovalTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Removal Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedWarehouseTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Warehouse Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSCustomsStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSCustoms Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSCycleCountStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSCycle Count Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSExceptionTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSException Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSFacilityCapabilities` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSFacility Capabilities. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSFacilityTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSFacility Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHandlingUnitTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHandling Unit Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHoldStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHold Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHoldTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHold Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSIntegrationEventStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSIntegration Event Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSInventoryStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSInventory Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSLocationStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSLocation Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSLocationTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSLocation Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderLineStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Line Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSScanEventTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSScan Event Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTaskStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTask Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTaskTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTask Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTransactionTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTransaction Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSZoneTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSZone Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |

## Legacy Warehouse Lookup Definition

### `sys_Warehouse_LocationTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for Warehouse Location Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `id` | Primary identifier for the warehouse location types row. | id; UUID; record identifier | `integer(32,0)` | 32 digits, 0 dp | Yes | PK |  |  |
| `created_at` | Timestamp/date when the row was created. | created at; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `created_by` | User or process that created the row. | created by; created date | `uuid` | UUID | No |  |  | `auth.uid()` |
| `WHLT_Desc` | Longer explanation of the lookup value. | WHLT Desc; Desc; description; details | `text` |  | No |  |  |  |


## Warehouse

| Table | Function | Purpose |
|---|---|---|
| `Warehouse` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseAreas` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse areas records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseCalendarEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Stores event/timeline rows for Warehouse Calendar Events. |
| `WarehouseLocations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores location roles, linked locations and location snapshots for Warehouse Locations. |
| `WarehouseMovements` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse movements records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseOfficeAccess` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse office access records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseOrderItems` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores goods/item rows for Warehouse Order Items. Use as the main editable grid for cargo or declaration item detail. |
| `WarehouseOrders` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse orders records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseSKU` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse sku records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseStock` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse stock records. Review linked foreign keys and lookup fields before building UI forms. |
| `WarehouseWorkItems` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores goods/item rows for Warehouse Work Items. Use as the main editable grid for cargo or declaration item detail. |

### `Warehouse`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `Name` | Human-readable name or title displayed to users. | Name | `character varying(50)` | 50 chars | Yes |  |  |  |
| `Organisation` | Organisation field for warehouse. | Organisation; anisation; company; party | `character varying(50)` | 50 chars | Yes |  |  |  |
| `Address1` | Address/location text used for parties, offices or legal snapshots. | Address1 | `character varying(50)` | 50 chars | Yes |  |  |  |
| `Address2` | Address/location text used for parties, offices or legal snapshots. | Address2 | `character varying(50)` | 50 chars | No |  |  |  |
| `TownCity` | Address/location text used for parties, offices or legal snapshots. | Town City; location; place | `character varying(50)` | 50 chars | No |  |  |  |
| `CountyState` | Address/location text used for parties, offices or legal snapshots. | County State | `character varying(50)` | 50 chars | No |  |  |  |
| `PostZipCode` | Code value used for lookup, external schema mapping or integration payloads. | Post Zip Code; code; lookup code | `character varying(50)` | 50 chars | No |  |  |  |
| `Country` | Country code or country snapshot used for routing, customs or address display. | Country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `UNLOCODE` | Code value used for lookup, external schema mapping or integration payloads. | UNLOCODE; code; lookup code | `character varying(5)` | 5 chars | No |  |  |  |
| `Email` | Email address or email contact field. | Email | `character varying(100)` | 100 chars | No |  |  |  |
| `Phone` | Telephone/contact number field. | Phone | `character varying(50)` | 50 chars | No |  |  |  |
| `Active` | Active field for warehouse. | Active; active flag; enabled | `bit(1)` | 1 chars | Yes |  |  |  |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp without time zone` | timestamp | No |  |  |  |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp without time zone` | timestamp | No |  |  |  |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `Deleted` | Deleted field for warehouse. | Deleted; deleted flag; voided | `bit(1)` | 1 chars | Yes |  |  |  |

### `WarehouseAreas`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse areas records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse areas row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |
| `Name` | Human-readable name or title displayed to users. | Name | `character varying(50)` | 50 chars | No |  |  |  |
| `Description` | Description shown in forms, grids or support screens. | Description; details | `text` |  | No |  |  |  |
| `Enabled` | Enabled field for warehouse areas. | Enabled | `boolean` | true/false | Yes |  |  | `true` |
| `Type` | Type field for warehouse areas. | Type | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `1` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `AreaCode` | Code value used for lookup, external schema mapping or integration payloads. | Area Code; code; lookup code | `character varying` |  | No |  |  |  |

### `WarehouseCalendarEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Stores event/timeline rows for Warehouse Calendar Events.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse calendar events row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `Customer_ID` | Links this row to Org_Master.Org_ID. | Customer ID; ID; customer; client; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WHO_ID` | Links this row to WarehouseOrders.Id. | WHO ID; ID; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseOrders.Id |  |  |
| `WHM_ID` | Links this row to WarehouseMovements.Id. | WHM ID; ID; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseMovements.Id |  |  |
| `UiId` | Ui Id field for warehouse calendar events. | Ui Id; id; UUID; record identifier | `character varying` |  | Yes |  |  |  |
| `Date` | Date/time used for workflow, validity, routing or external reporting. | Date | `date` | date | Yes |  |  |  |
| `StartTime` | Date/time used for workflow, validity, routing or external reporting. | Start Time | `time without time zone` |  | Yes |  |  |  |
| `EndTime` | Date/time used for workflow, validity, routing or external reporting. | End Time | `time without time zone` |  | Yes |  |  |  |
| `Title` | Human-readable name or title displayed to users. | Title | `character varying` |  | Yes |  |  |  |
| `Type` | Type field for warehouse calendar events. | Type | `character varying` |  | Yes |  |  |  |
| `CustomerKey` | Customer Key field for warehouse calendar events. | Customer Key; customer; client | `character varying` |  | Yes |  |  |  |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying` |  | Yes |  |  |  |
| `CustomerShortName` | Human-readable name or title displayed to users. | Customer Short Name; customer; client | `character varying` |  | Yes |  |  |  |
| `CustomerColor` | Customer Color field for warehouse calendar events. | Customer Color; customer; client | `character varying` |  | Yes |  |  |  |
| `Tone` | Tone field for warehouse calendar events. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedByUserId` | User or process that created the row. | Created By User Id; id; UUID; record identifier; created date; created by | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |

### `WarehouseLocations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores location roles, linked locations and location snapshots for Warehouse Locations.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse locations row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `AreaId` | Links this row to WarehouseAreas.Id. | Area Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WarehouseAreas.Id |  |  |
| `Type` | Enum/lookup code selected from sys_Warehouse_LocationTypes. | Type | `integer(32,0)` | 32 digits, 0 dp | No | FK -> sys_Warehouse_LocationTypes.id | **ENUM** `sys_Warehouse_LocationTypes` |  |
| `Height` | Cargo measurement used for operational, rating, customs or document output. | Height | `integer(32,0)` | 32 digits, 0 dp | No |  |  |  |
| `Width` | Cargo measurement used for operational, rating, customs or document output. | Width | `integer(32,0)` | 32 digits, 0 dp | No |  |  |  |
| `Depth` | Depth field for warehouse locations. | Depth | `integer(32,0)` | 32 digits, 0 dp | No |  |  |  |
| `MaxKilos` | Max Kilos field for warehouse locations. | Max Kilos | `integer(32,0)` | 32 digits, 0 dp | No |  |  |  |
| `Enabled` | Enabled field for warehouse locations. | Enabled | `boolean` | true/false | Yes |  |  | `true` |
| `MultiProduct` | Multi Product field for warehouse locations. | Multi Product | `boolean` | true/false | No |  |  | `false` |
| `Code` | Code value used for lookup, external schema mapping or integration payloads. | Code; lookup code | `character varying` |  | No |  |  |  |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WarehouseMovements`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse movements records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse movements row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `ProductId` | Links this row to WarehouseSKU.Id. | Product Id; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseSKU.Id |  |  |
| `OrderId` | Links this row to WarehouseOrders.Id. | Order Id; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseOrders.Id |  |  |
| `LocationId` | Links this row to WarehouseLocations.Id. | Location Id; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseLocations.Id |  |  |
| `Ref` | Ref field for warehouse movements. | Ref; reference; external reference | `character varying` |  | Yes |  |  |  |
| `Direction` | Direction field for warehouse movements. | Direction | `character varying` |  | Yes |  |  |  |
| `ProductName` | Human-readable name or title displayed to users. | Product Name | `character varying` |  | Yes |  |  |  |
| `Reference` | Reference value used to link external systems, documents or user-visible identifiers. | Reference; external reference | `character varying` |  | No |  |  |  |
| `Quantity` | Cargo measurement used for operational, rating, customs or document output. | Quantity; qty | `character varying` |  | No |  |  |  |
| `Dock` | Dock field for warehouse movements. | Dock | `character varying` |  | No |  |  |  |
| `Time` | Date/time used for workflow, validity, routing or external reporting. | Time | `character varying` |  | No |  |  |  |
| `Status` | Lifecycle status for workflow, badges and filtering. | Status; stage | `character varying` |  | Yes |  |  |  |
| `Tone` | Tone field for warehouse movements. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedByUserId` | User or process that created the row. | Created By User Id; id; UUID; record identifier; created date; created by | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |

### `WarehouseOfficeAccess`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse office access records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WarehouseId` | Primary identifier for the warehouse office access row. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | PK; FK -> Warehouse.Id |  |  |
| `OfficeId` | Primary identifier for the warehouse office access row. | Office Id; office; branch; id; UUID; record identifier | `uuid` | UUID | Yes | PK; FK -> cmp_Offices.Office_ID |  |  |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WarehouseOrderItems`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores goods/item rows for Warehouse Order Items. Use as the main editable grid for cargo or declaration item detail.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse order items row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |
| `OrderId` | Links this row to WarehouseOrders.Id. | Order Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WarehouseOrders.Id |  |  |
| `ProductId` | Links this row to WarehouseSKU.Id. | Product Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WarehouseSKU.Id |  |  |
| `StockId` | Links this row to WarehouseStock.Id. | Stock Id; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseStock.Id |  |  |
| `LocationId` | Links this row to WarehouseLocations.Id. | Location Id; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseLocations.Id |  |  |
| `LineNumber` | Numbering or ordering field used for display, document output or line sequencing. | Line Number; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  |  |
| `Quantity` | Cargo measurement used for operational, rating, customs or document output. | Quantity; qty | `numeric` |  | Yes |  |  | `0` |
| `Allocated` | Allocated field for warehouse order items. | Allocated | `numeric` |  | Yes |  |  | `0` |
| `Picked` | Picked field for warehouse order items. | Picked | `numeric` |  | Yes |  |  | `0` |
| `Shipped` | Shipped field for warehouse order items. | Shipped | `numeric` |  | Yes |  |  | `0` |
| `UnitOfMeasure` | Unit Of Measure field for warehouse order items. | Unit Of Measure | `character varying(20)` | 20 chars | No |  |  |  |
| `LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | Lot Number; number; reference | `character varying` |  | No |  |  |  |
| `Notes` | Free-text content entered by users or generated by the system. | Notes; comments | `text` |  | No |  |  |  |
| `Status` | Lifecycle status for workflow, badges and filtering. | Status; stage | `character varying` |  | Yes |  |  | `'Planned'::character varying` |
| `Tone` | Tone field for warehouse order items. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WarehouseOrders`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse orders records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse orders row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `CustomerId` | Links this row to Org_Master.Org_ID. | Customer Id; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `JobId` | Links this row to Job_Header.Job_ID. | Job Id; Id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `Ref` | Ref field for warehouse orders. | Ref; reference; external reference | `character varying` |  | Yes |  |  |  |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying` |  | Yes |  |  |  |
| `Route` | Route field for warehouse orders. | Route | `character varying` |  | No |  |  |  |
| `Type` | Type field for warehouse orders. | Type | `character varying` |  | Yes |  |  |  |
| `Lines` | Numbering or ordering field used for display, document output or line sequencing. | Lines | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |
| `Value` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Value; amount; total | `character varying` |  | No |  |  |  |
| `Due` | Due field for warehouse orders. | Due | `character varying` |  | No |  |  |  |
| `Window` | Window field for warehouse orders. | Window | `character varying` |  | No |  |  |  |
| `Status` | Lifecycle status for workflow, badges and filtering. | Status; stage | `character varying` |  | Yes |  |  |  |
| `Tone` | Tone field for warehouse orders. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |

### `WarehouseSKU`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse sku records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse sku row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |
| `OrgId` | Links this row to Org_Master.Org_ID. | Org Id; Id; organisation; company; party; UUID; record identifier | `uuid` | UUID | Yes | FK -> Org_Master.Org_ID |  |  |
| `SKU` | SKU field for warehouse sku. | SKU | `character varying` |  | Yes |  |  |  |
| `Description` | Description shown in forms, grids or support screens. | Description; details | `character varying` |  | Yes |  |  |  |
| `HSCode` | Code value used for lookup, external schema mapping or integration payloads. | HSCode; code; lookup code | `character varying` |  | No |  |  |  |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `Deleted` | Deleted field for warehouse sku. | Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WarehouseStock`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse stock records. Review linked foreign keys and lookup fields before building UI forms.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse stock row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `ProductId` | Links this row to WarehouseSKU.Id. | Product Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WarehouseSKU.Id |  |  |
| `LocationId` | Links this row to WarehouseLocations.Id. | Location Id; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseLocations.Id |  |  |
| `UiId` | Ui Id field for warehouse stock. | Ui Id; id; UUID; record identifier | `character varying` |  | Yes |  |  |  |
| `LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | Lot Number; number; reference | `character varying` |  | No |  |  |  |
| `OnHand` | On Hand field for warehouse stock. | On Hand | `numeric` |  | Yes |  |  | `0` |
| `Allocated` | Allocated field for warehouse stock. | Allocated | `numeric` |  | Yes |  |  | `0` |
| `Available` | Available field for warehouse stock. | Available | `numeric` |  | No |  |  |  |
| `FillPct` | Fill Pct field for warehouse stock. | Fill Pct | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |
| `NextMovement` | Next Movement field for warehouse stock. | Next Movement | `character varying` |  | No |  |  |  |
| `Status` | Lifecycle status for workflow, badges and filtering. | Status; stage | `character varying` |  | Yes |  |  | `'Available'::character varying` |
| `Tone` | Tone field for warehouse stock. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |

### `WarehouseWorkItems`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores goods/item rows for Warehouse Work Items. Use as the main editable grid for cargo or declaration item detail.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `Id` | Primary identifier for the warehouse work items row. | Id; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `MovementId` | Links this row to WarehouseMovements.Id. | Movement Id; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseMovements.Id |  |  |
| `Board` | Board field for warehouse work items. | Board | `character varying` |  | Yes |  |  |  |
| `ColumnId` | Column Id field for warehouse work items. | Column Id; id; UUID; record identifier | `character varying` |  | Yes |  |  |  |
| `ColumnTitle` | Human-readable name or title displayed to users. | Column Title | `character varying` |  | Yes |  |  |  |
| `ColumnMeta` | Column Meta field for warehouse work items. | Column Meta; ETA; estimated arrival | `character varying` |  | No |  |  |  |
| `CardId` | Card Id field for warehouse work items. | Card Id; id; UUID; record identifier | `character varying` |  | Yes |  |  |  |
| `Title` | Human-readable name or title displayed to users. | Title | `character varying` |  | Yes |  |  |  |
| `Meta` | Meta field for warehouse work items. | Meta; ETA; estimated arrival | `character varying` |  | No |  |  |  |
| `Status` | Lifecycle status for workflow, badges and filtering. | Status; stage | `character varying` |  | Yes |  |  |  |
| `Tone` | Tone field for warehouse work items. | Tone | `character varying` |  | Yes |  |  | `'neutral'::character varying` |
| `SortOrder` | Numbering or ordering field used for display, document output or line sequencing. | Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |
| `CreatedAt` | Timestamp/date when the row was created. | Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `UpdatedAt` | Timestamp/date when the row was last changed. | Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `CreatedBy` | User or process that created the row. | Created By; created date | `uuid` | UUID | No |  |  |  |
| `IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |
| `WarehouseId` | Links this row to Warehouse.Id. | Warehouse Id; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Warehouse.Id |  |  |

## Warehouse Management System (WMS)

| Table | Function | Purpose |
|---|---|---|
| `WMS_AIInsights` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores AI-generated WMS suggestions for slotting, release risk, exceptions, stock accuracy, ageing, billing and KPI improvement. |
| `WMS_AdjustmentLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores stock adjustment lines and their posted inventory transaction references. |
| `WMS_Adjustments` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores governed stock adjustment headers with approval and workflow linkage. |
| `WMS_AppointmentSlots` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores inbound/outbound warehouse appointments linked to docks, jobs, orders, carriers, vehicles and drivers. |
| `WMS_BillingEventLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores detail lines under a warehouse billing event. |
| `WMS_BillingEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Stores WMS chargeable events for storage, receipt, pick/pack, dispatch, VAS, bonded admin and other warehouse charges before finance posting. |
| `WMS_BondedAuthorisationSites` | Operational master/header table that owns a business object or lifecycle record in its module. | Maps bonded authorisations to authorised facilities, zones and locations. |
| `WMS_BondedAuthorisations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores customs/bonded warehouse authorisations, jurisdiction, authorisation number, holder, validity and approved procedure metadata. |
| `WMS_BondedDepositors` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores depositors, importers or procedure holders linked to a bonded authorisation. |
| `WMS_BondedDiscrepancies` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bonded stock discrepancies requiring customs/compliance review. |
| `WMS_BondedEntries` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bonded warehouse entry/admission headers linked to jobs, orders, declarations, depositors, importers and guarantee exposure. |
| `WMS_BondedEntryLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores bonded entry line data including HS code, origin, quantity, weight, customs value, duty/tax estimate and restrictions. |
| `WMS_BondedEquivalenceRules` | Configuration table that defines behaviour, reusable rules, governed templates or versioned setup. | Stores authorised equivalence/FIFO/specific-identification rules for bonded stock where permitted. |
| `WMS_BondedGuarantees` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bonded/customs guarantee references, providers, limits, used amounts and validity. |
| `WMS_BondedInventoryLinks` | Relationship bridge table that connects one business record to another without duplicating the master data. | Links bonded entry lines to live inventory balances, lots and handling units so customs stock can be reconciled. |
| `WMS_BondedMovements` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bonded stock movements such as admission, internal move, usual handling, temporary removal, withdrawal and destruction. |
| `WMS_BondedReconciliations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores periodic bonded stock reconciliation runs, quantities, discrepancy counts and report links. |
| `WMS_BondedRemovalLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores bonded removal line quantities, customs value and estimated duty/tax due. |
| `WMS_BondedRemovals` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bonded removal/withdrawal headers for free circulation, re-export, transfer, temporary removal, destruction or other approved discharge. |
| `WMS_BondedTemporaryRemovals` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores temporary removals from bonded control, due-back dates, permission references and return status. |
| `WMS_BondedUsualHandling` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores authorised usual forms of handling allowed under the bonded/customs warehouse authorisation. |
| `WMS_CustomerFacilityAccess` | Relationship bridge table that connects a warehouse customer organisation to the facilities it may use. | Enforces the facility boundary for customer portal inventory, items, inbound advice and outbound requests. |
| `WMS_CustomerProfiles` | Configuration table that defines behaviour, reusable rules, governed templates or versioned setup. | Stores warehouse customer rules, default facility, allocation/pick method, portal stock visibility, ASN requirements and bonded-stock permission. |
| `WMS_CycleCountLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores counted stock lines, system quantity, counted quantity and variance. |
| `WMS_CycleCountPlans` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores physical/cycle count plans by facility, customer, zone and planned dates. |
| `WMS_Dispatches` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse dispatch headers linked to outbound orders, jobs, carriers, vehicles, containers and POD documents. |
| `WMS_Docks` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores inbound and outbound dock doors/slots used for warehouse appointments and loading/unloading. |
| `WMS_Documents` | Operational master/header table that owns a business object or lifecycle record in its module. | Links WMS operational documents to Job_Documents, generated document builder outputs, QR/security references and file metadata. |
| `WMS_Equipment` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse equipment such as forklifts, scanners and handling equipment for assignment, certification and task planning. |
| `WMS_ExceptionActions` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores actions required to resolve warehouse exceptions. |
| `WMS_Exceptions` | Control and review table for operational blocks, exceptions, approval decisions and human review workflows. | Stores warehouse operational exceptions linked to jobs, orders, tasks, receipts, balances and workflow tasks. |
| `WMS_Facilities` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse facility master data for freight, 3PL, fulfilment, cross-dock and bonded/customs-controlled operations. Links to existing Warehouse records without replacing them. |
| `WMS_FacilityCapabilities` | Relationship bridge table that connects one business record to another without duplicating the master data. | Stores facility capabilities such as bonded storage, dangerous goods, cold chain, customs inspection and value-added services. |
| `WMS_FacilityOffices` | Operational master/header table that owns a business object or lifecycle record in its module. | Maps WMS facilities to internal company offices using OrgOfficeID so one facility can serve multiple operating offices or brands. |
| `WMS_HandlingUnitContents` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores the item, lot, serial, quantity and status contents inside a handling unit. |
| `WMS_HandlingUnitEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Stores handling-unit event history such as creation, movement, sealing, nesting, dispatch and exception events. |
| `WMS_HandlingUnits` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores pallets, cartons, containers, LPNs, SSCCs and nested physical units linked to jobs, orders, locations and customs status. |
| `WMS_InboundAdviceLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores expected inbound advice line quantities, lots, expiry and customs status. |
| `WMS_InboundAdvices` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores ASN/inbound advice headers from customers, EDI/API or jobs before physical receipt. |
| `WMS_IntegrationEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Queues WMS integration events from jobs, EDI/API, portals, MultiDeck Exchange, finance, tracking and automation workers. |
| `WMS_InventoryAllocations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores allocation rows that bind outbound order lines to specific inventory balances. |
| `WMS_InventoryBalances` | Current-state or summarised balance table used for enquiry and operational control. | Stores recalculatable stock balance snapshots by facility, customer, item, location, lot, serial, handling unit, inventory status and customs status. |
| `WMS_InventoryHolds` | Control and review table for operational blocks, exceptions, approval decisions and human review workflows. | Stores active and released stock holds for customer, quality, damage, customs, bonded, trade compliance, finance, recall or system reasons. |
| `WMS_InventoryLots` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores item lot/batch/expiry/origin/customs-status data for traceability and bonded stock control. |
| `WMS_InventoryReservations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores reservation rows that reserve stock for outbound orders before physical allocation/picking. |
| `WMS_InventorySerials` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores serial-numbered inventory items and their current location, handling unit and customs/inventory status. |
| `WMS_InventoryTransactionLinks` | Relationship bridge table that connects one business record to another without duplicating the master data. | Links inventory transactions to related jobs, documents, customs records, EDI messages, workflow tasks or other business records. |
| `WMS_InventoryTransactions` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Immutable WMS inventory ledger. This is the source of truth for receipts, dispatches, moves, adjustments, bonded admissions and removals. |
| `WMS_ItemBarcodes` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores item barcode aliases such as internal, customer, supplier, GTIN, EAN, UPC and package-level barcodes. |
| `WMS_ItemComplianceProfiles` | Configuration table that defines behaviour, reusable rules, governed templates or versioned setup. | Stores jurisdiction-specific item compliance details such as HS, ECCN, licence need, SPS/excise flags and product-control linkage. |
| `WMS_ItemUOMs` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores item unit-of-measure conversions and packaging dimensions used for receiving, stock, fulfilment and rating. |
| `WMS_Items` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores WMS item/SKU master data including HS/ECCN, origin, dimensions, weight, serial/lot/expiry rules, bonded eligibility and compliance flags. |
| `WMS_KPIResults` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores WMS KPI snapshots by facility, office, customer and period. |
| `WMS_Locations` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores bin, rack, dock, staging, yard and virtual locations with capacity, barcode, status and customs/bonded rules. |
| `WMS_OrderLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores warehouse order line detail including expected/received/allocated/picked/packed/dispatched quantities and customs status. |
| `WMS_OrderParties` | Relationship bridge table that connects one business record to another without duplicating the master data. | Stores parties on a warehouse order such as customer, supplier, carrier, consignee, depositor, importer, driver or agent. |
| `WMS_OrderReferences` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores customer, carrier, customs, job, EDI and external references attached to a warehouse order. |
| `WMS_Orders` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse inbound, outbound, transfer, return, cross-dock, bonded, inspection, adjustment and value-added service orders. Orders can link directly to Job_Header and deeper job cargo/equipment through record links. |
| `WMS_PackTasks` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores pack task execution details against outbound orders and handling units. |
| `WMS_Packages` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores outbound packages, tracking numbers, labels and physical measurements. |
| `WMS_PhotoEvidence` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse photo evidence metadata linked to WMS records and jobs. |
| `WMS_PickTasks` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores pick task execution details against order lines and inventory balances. |
| `WMS_ReceiptDiscrepancies` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores inbound discrepancies such as over, short, damage, wrong item, temperature breach, customs issue or missing documents. |
| `WMS_ReceiptLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores receipt line quantities, damage/over/short values, target locations and posted inventory transaction links. |
| `WMS_Receipts` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores goods-received note headers linked to orders, jobs, advice records, docks and receiving locations. |
| `WMS_RecordLinks` | Relationship bridge table that connects one business record to another without duplicating the master data. | Generic WMS record-link table for linking WMS records to jobs, job cargo, job equipment, customs, EDI, documents, workflow, finance and portal records without duplicating data. |
| `WMS_ScanEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Stores barcode/QR/location/item/handling-unit scans with expected/scanned values and mismatch flags. |
| `WMS_ScanSessions` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores mobile scan sessions by user/device/task. |
| `WMS_ServiceContractLines` | Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction. | Stores chargeable warehouse service lines such as receipt, storage, pick/pack, dispatch, labelling and bonded administration. |
| `WMS_ServiceContracts` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores customer warehouse service contract headers linked to rates/finance where required. |
| `WMS_StorageRules` | Configuration table that defines behaviour, reusable rules, governed templates or versioned setup. | Stores storage charging rules by contract, facility, zone, item, inventory status, customs status, free days and billing basis. |
| `WMS_TaskAssignments` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores task assignment history to users, roles or equipment. |
| `WMS_TaskEvents` | Event, ledger or history table used to preserve movement, audit, timeline or financial source records. | Stores task status/event timeline entries. |
| `WMS_Tasks` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores mobile and back-office warehouse tasks such as receive, putaway, move, pick, pack, dispatch, count, inspection and VAS. |
| `WMS_Waves` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores outbound picking waves. |
| `WMS_Zones` | Operational master/header table that owns a business object or lifecycle record in its module. | Stores warehouse zones such as bonded, quarantine, pick face, bulk, receiving, dispatch, returns, cold-chain and dangerous-goods areas. |
| `sys_WMSAIInsightTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSAIInsight Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSAdjustmentStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSAdjustment Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBillingBasis` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBilling Basis. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBillingStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBilling Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedDiscrepancyTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Discrepancy Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedMovementTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Movement Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedProcedureTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Procedure Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedRemovalTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Removal Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSBondedWarehouseTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSBonded Warehouse Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSCustomsStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSCustoms Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSCycleCountStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSCycle Count Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSExceptionTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSException Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSFacilityCapabilities` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSFacility Capabilities. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSFacilityTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSFacility Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHandlingUnitTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHandling Unit Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHoldStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHold Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSHoldTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSHold Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSIntegrationEventStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSIntegration Event Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSInventoryStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSInventory Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSLocationStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSLocation Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSLocationTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSLocation Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderLineStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Line Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSOrderTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSOrder Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSScanEventTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSScan Event Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTaskStatuses` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTask Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTaskTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTask Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSTransactionTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSTransaction Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |
| `sys_WMSZoneTypes` | Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping. | Lookup/reference table for WMSZone Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them. |

### `WMS_AIInsights`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores AI-generated WMS suggestions for slotting, release risk, exceptions, stock accuracy, ageing, billing and KPI improvement.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAIInsight_ID` | Primary identifier for the wms aiinsights row. | WMSAIInsight ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAIInsight_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSAIInsight Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSAIInsight_InsightTypeCode` | Enum/lookup code selected from sys_WMSAIInsightTypes. | WMSAIInsight Insight Type Code; Insight Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSAIInsightTypes.WMSAIInsightType_Code | **ENUM** `sys_WMSAIInsightTypes`: `slotting = Slotting`, `exception_root_cause = Exception root cause`, `release_risk = Release risk`, `stock_accuracy = Stock accuracy`, `ageing = Ageing stock`, `billing_risk = Billing risk`, `customer_service = Customer service`, `kpi = KPI improvement` |  |
| `WMSAIInsight_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSAIInsight Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'suggested'::character varying` |
| `WMSAIInsight_Title` | Human-readable name or title displayed to users. | WMSAIInsight Title; Title | `character varying(220)` | 220 chars | Yes |  |  |  |
| `WMSAIInsight_Summary` | WMSAIInsight Summary field for wms aiinsights. | WMSAIInsight Summary; Summary | `text` |  | Yes |  |  |  |
| `WMSAIInsight_Recommendation` | WMSAIInsight Recommendation field for wms aiinsights. | WMSAIInsight Recommendation; Recommendation | `text` |  | No |  |  |  |
| `WMSAIInsight_ConfidenceScore` | AI confidence, quality or scoring metric. | WMSAIInsight Confidence Score; Confidence Score | `numeric(9,4)` | 9 digits, 4 dp | No |  |  |  |
| `WMSAIInsight_RiskScore` | AI confidence, quality or scoring metric. | WMSAIInsight Risk Score; Risk Score | `numeric(9,4)` | 9 digits, 4 dp | No |  |  |  |
| `WMSAIInsight_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSAIInsight Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSAIInsight_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSAIInsight Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSAIInsight_ExceptionID` | Links this row to WMS_Exceptions.WMSException_ID. | WMSAIInsight Exception ID; Exception ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Exceptions.WMSException_ID |  |  |
| `WMSAIInsight_JobID` | Links this row to Job_Header.Job_ID. | WMSAIInsight Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSAIInsight_AITaskRunID` | WMSAIInsight AITask Run ID field for wms aiinsights. | WMSAIInsight AITask Run ID; AITask Run ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSAIInsight_EvidenceJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSAIInsight Evidence JSON; Evidence JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSAIInsight_UserDecisionCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAIInsight User Decision Code; User Decision Code; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSAIInsight_UserDecisionAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAIInsight User Decision At; User Decision At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSAIInsight_UserDecisionBy` | Links this row to cmp_Users.User_ID. | WMSAIInsight User Decision By; User Decision By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSAIInsight_CreatedAt` | Timestamp/date when the row was created. | WMSAIInsight Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_AdjustmentLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores stock adjustment lines and their posted inventory transaction references.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAdjustLine_ID` | Primary identifier for the wms adjustment lines row. | WMSAdjust Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAdjustLine_AdjustmentID` | Links this row to WMS_Adjustments.WMSAdjust_ID. | WMSAdjust Line Adjustment ID; Adjustment ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Adjustments.WMSAdjust_ID |  |  |
| `WMSAdjustLine_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSAdjust Line Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSAdjustLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSAdjust Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSAdjustLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdjust Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSAdjustLine_PreviousQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSAdjust Line Previous Quantity; Previous Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSAdjustLine_NewQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSAdjust Line New Quantity; New Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSAdjustLine_AdjustmentQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSAdjust Line Adjustment Quantity; Adjustment Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSAdjustLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAdjust Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSAdjustLine_InventoryTransactionID` | Links this row to WMS_InventoryTransactions.WMSTransaction_ID. | WMSAdjust Line Inventory Transaction ID; Inventory Transaction ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryTransactions.WMSTransaction_ID |  |  |
| `WMSAdjustLine_Notes` | Free-text content entered by users or generated by the system. | WMSAdjust Line Notes; Notes; comments | `text` |  | No |  |  |  |

### `WMS_Adjustments`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores governed stock adjustment headers with approval and workflow linkage.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAdjust_ID` | Primary identifier for the wms adjustments row. | WMSAdjust ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAdjust_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSAdjust Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSAdjust_AdjustmentNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdjust Adjustment Number; Adjustment Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSAdjust_StatusCode` | Enum/lookup code selected from sys_WMSAdjustmentStatuses. | WMSAdjust Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSAdjustmentStatuses.WMSAdjustmentStatus_Code | **ENUM** `sys_WMSAdjustmentStatuses`: `draft = Draft`, `pending_approval = Pending approval`, `approved = Approved`, `posted = Posted`, `rejected = Rejected`, `cancelled = Cancelled` | `'draft'::character varying` |
| `WMSAdjust_ReasonCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAdjust Reason Code; Reason Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSAdjust_CycleCountPlanID` | Links this row to WMS_CycleCountPlans.WMSCountPlan_ID. | WMSAdjust Cycle Count Plan ID; Cycle Count Plan ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_CycleCountPlans.WMSCountPlan_ID |  |  |
| `WMSAdjust_JobID` | Links this row to Job_Header.Job_ID. | WMSAdjust Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSAdjust_RequiresApproval` | WMSAdjust Requires Approval field for wms adjustments. | WMSAdjust Requires Approval; Requires Approval | `boolean` | true/false | Yes |  |  | `true` |
| `WMSAdjust_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSAdjust Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSAdjust_Notes` | Free-text content entered by users or generated by the system. | WMSAdjust Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSAdjust_CreatedAt` | Timestamp/date when the row was created. | WMSAdjust Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSAdjust_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSAdjust Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSAdjust_PostedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAdjust Posted At; Posted At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSAdjust_PostedBy` | Links this row to cmp_Users.User_ID. | WMSAdjust Posted By; Posted By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_AppointmentSlots`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores inbound/outbound warehouse appointments linked to docks, jobs, orders, carriers, vehicles and drivers.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAppt_ID` | Primary identifier for the wms appointment slots row. | WMSAppt ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAppt_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSAppt Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSAppt_DockID` | Links this row to WMS_Docks.WMSDock_ID. | WMSAppt Dock ID; Dock ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Docks.WMSDock_ID |  |  |
| `WMSAppt_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSAppt Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSAppt_JobID` | Links this row to Job_Header.Job_ID. | WMSAppt Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSAppt_DirectionCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAppt Direction Code; Direction Code; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  |  |
| `WMSAppt_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSAppt Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'booked'::character varying` |
| `WMSAppt_StartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAppt Start At; Start At | `timestamp with time zone` | timestamp | Yes |  |  |  |
| `WMSAppt_EndAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAppt End At; End At | `timestamp with time zone` | timestamp | Yes |  |  |  |
| `WMSAppt_CarrierOrgID` | Links this row to Org_Master.Org_ID. | WMSAppt Carrier Org ID; Carrier Org ID; organisation; company; party; carrier; shipping line; airline; haulier; id | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSAppt_VehicleReg` | WMSAppt Vehicle Reg field for wms appointment slots. | WMSAppt Vehicle Reg; Vehicle Reg | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSAppt_DriverName` | Human-readable name or title displayed to users. | WMSAppt Driver Name; Driver Name | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSAppt_Notes` | Free-text content entered by users or generated by the system. | WMSAppt Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSAppt_CreatedAt` | Timestamp/date when the row was created. | WMSAppt Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSAppt_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSAppt Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BillingEventLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores detail lines under a warehouse billing event.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBillLine_ID` | Primary identifier for the wms billing event lines row. | WMSBill Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBillLine_BillingEventID` | Links this row to WMS_BillingEvents.WMSBillEvent_ID. | WMSBill Line Billing Event ID; Billing Event ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_BillingEvents.WMSBillEvent_ID |  |  |
| `WMSBillLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSBill Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSBillLine_SourceTable` | Name of the source/target database table linked to this row. | WMSBill Line Source Table; Source Table | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBillLine_SourceID` | Identifier of the linked source/target record. | WMSBill Line Source ID; Source ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSBillLine_Description` | Description shown in forms, grids or support screens. | WMSBill Line Description; Description; details | `text` |  | Yes |  |  |  |
| `WMSBillLine_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBill Line Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `1` |
| `WMSBillLine_UnitRate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Line Unit Rate; Unit Rate; rate; ROE; exchange rate | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBillLine_NetAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Line Net Amount; Net Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |

### `WMS_BillingEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Stores WMS chargeable events for storage, receipt, pick/pack, dispatch, VAS, bonded admin and other warehouse charges before finance posting.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBillEvent_ID` | Primary identifier for the wms billing events row. | WMSBill Event ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBillEvent_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBill Event Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBillEvent_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSBill Event Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Org_Master.Org_ID |  |  |
| `WMSBillEvent_ContractID` | Links this row to WMS_ServiceContracts.WMSContract_ID. | WMSBill Event Contract ID; Contract ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_ServiceContracts.WMSContract_ID |  |  |
| `WMSBillEvent_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSBill Event Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSBillEvent_JobID` | Links this row to Job_Header.Job_ID. | WMSBill Event Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSBillEvent_StatusCode` | Enum/lookup code selected from sys_WMSBillingStatuses. | WMSBill Event Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBillingStatuses.WMSBillingStatus_Code | **ENUM** `sys_WMSBillingStatuses`: `draft = Draft`, `ready = Ready`, `exported = Exported`, `cancelled = Cancelled` | `'ready'::character varying` |
| `WMSBillEvent_EventTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBill Event Event Type Code; Event Type Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSBillEvent_EventDate` | Date/time used for workflow, validity, routing or external reporting. | WMSBill Event Event Date; Event Date | `date` | date | Yes |  |  | `CURRENT_DATE` |
| `WMSBillEvent_Description` | Description shown in forms, grids or support screens. | WMSBill Event Description; Description; details | `text` |  | Yes |  |  |  |
| `WMSBillEvent_BillingBasisCode` | Enum/lookup code selected from sys_WMSBillingBasis. | WMSBill Event Billing Basis Code; Billing Basis Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBillingBasis.WMSBillingBasis_Code | **ENUM** `sys_WMSBillingBasis`: `per_order = Per order`, `per_line = Per line`, `per_pallet = Per pallet`, `per_carton = Per carton`, `per_unit = Per unit`, `per_kg = Per kg`, `per_cbm = Per CBM`, `per_day = Per day`, `per_week = Per week`, `per_month = Per month`, `flat = Flat` |  |
| `WMSBillEvent_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBill Event Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `1` |
| `WMSBillEvent_UnitRate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Event Unit Rate; Unit Rate; rate; ROE; exchange rate | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBillEvent_NetAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Event Net Amount; Net Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBillEvent_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBill Event Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSBillEvent_FINDocumentLineID` | Links this row to FIN_DocumentLines.FINDocLine_ID. | WMSBill Event FINDocument Line ID; FINDocument Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> FIN_DocumentLines.FINDocLine_ID |  |  |
| `WMSBillEvent_RateResultID` | Links this row to RATE_RateResults.RATEResult_ID. | WMSBill Event Rate Result ID; Rate Result ID; rate; ROE; exchange rate; id; UUID; record identifier | `uuid` | UUID | No | FK -> RATE_RateResults.RATEResult_ID |  |  |
| `WMSBillEvent_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBill Event Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSBillEvent_CreatedAt` | Timestamp/date when the row was created. | WMSBill Event Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBillEvent_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBill Event Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedAuthorisationSites`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Maps bonded authorisations to authorised facilities, zones and locations.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondSite_ID` | Primary identifier for the wms bonded authorisation sites row. | WMSBond Site ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondSite_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Site Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondSite_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Site Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondSite_ZoneID` | Links this row to WMS_Zones.WMSZone_ID. | WMSBond Site Zone ID; Zone ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Zones.WMSZone_ID |  |  |
| `WMSBondSite_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSBond Site Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSBondSite_SiteReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Site Site Reference; Site Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondSite_IsDefault` | Marks the default value within its parent scope. | WMSBond Site Is Default; Is Default | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBondSite_IsActive` | Availability flag for new use in the application. | WMSBond Site Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_BondedAuthorisations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores customs/bonded warehouse authorisations, jurisdiction, authorisation number, holder, validity and approved procedure metadata.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondAuth_ID` | Primary identifier for the wms bonded authorisations row. | WMSBond Auth ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondAuth_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Auth Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondAuth_AuthorisationNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Auth Authorisation Number; Authorisation Number; number; reference | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSBondAuth_JurisdictionCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Auth Jurisdiction Code; Jurisdiction Code; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  |  |
| `WMSBondAuth_WarehouseTypeCode` | Enum/lookup code selected from sys_WMSBondedWarehouseTypes. | WMSBond Auth Warehouse Type Code; Warehouse Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBondedWarehouseTypes.WMSBondedWarehouseType_Code | **ENUM** `sys_WMSBondedWarehouseTypes`: `public_customs_warehouse = Public customs warehouse`, `private_customs_warehouse = Private customs warehouse`, `free_zone = Free zone`, `excise_warehouse = Excise warehouse`, `us_class_3 = US Class 3`, `us_class_4 = US Class 4`, `us_class_9 = US Class 9`, `other = Other` |  |
| `WMSBondAuth_AuthorityName` | Human-readable name or title displayed to users. | WMSBond Auth Authority Name; Authority Name | `character varying(180)` | 180 chars | No |  |  |  |
| `WMSBondAuth_HolderOrgID` | Links this row to Org_Master.Org_ID. | WMSBond Auth Holder Org ID; Holder Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBondAuth_ValidFrom` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Auth Valid From; Valid From | `date` | date | Yes |  |  |  |
| `WMSBondAuth_ValidTo` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Auth Valid To; Valid To | `date` | date | No |  |  |  |
| `WMSBondAuth_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Auth Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'active'::character varying` |
| `WMSBondAuth_ApprovedProceduresJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Auth Approved Procedures JSON; Approved Procedures JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSBondAuth_ApprovedHandlingJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Auth Approved Handling JSON; Approved Handling JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSBondAuth_ConditionsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Auth Conditions JSON; Conditions JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSBondAuth_CreatedAt` | Timestamp/date when the row was created. | WMSBond Auth Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondAuth_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Auth Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedDepositors`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores depositors, importers or procedure holders linked to a bonded authorisation.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondDepositor_ID` | Primary identifier for the wms bonded depositors row. | WMSBond Depositor ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondDepositor_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Depositor Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondDepositor_OrgID` | Links this row to Org_Master.Org_ID. | WMSBond Depositor Org ID; Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> Org_Master.Org_ID |  |  |
| `WMSBondDepositor_RoleCode` | Business role used to classify the row in the UI and validation rules. | WMSBond Depositor Role Code; Role Code; code; lookup code | `character varying(60)` | 60 chars | Yes | Unique group |  | `'depositor'::character varying` |
| `WMSBondDepositor_Reference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Depositor Reference; Reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondDepositor_IsActive` | Availability flag for new use in the application. | WMSBond Depositor Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondDepositor_CreatedAt` | Timestamp/date when the row was created. | WMSBond Depositor Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_BondedDiscrepancies`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bonded stock discrepancies requiring customs/compliance review.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondDisc_ID` | Primary identifier for the wms bonded discrepancies row. | WMSBond Disc ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondDisc_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Disc Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondDisc_EntryID` | Links this row to WMS_BondedEntries.WMSBondEntry_ID. | WMSBond Disc Entry ID; Entry ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntries.WMSBondEntry_ID |  |  |
| `WMSBondDisc_EntryLineID` | Links this row to WMS_BondedEntryLines.WMSBondEntryLine_ID. | WMSBond Disc Entry Line ID; Entry Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntryLines.WMSBondEntryLine_ID |  |  |
| `WMSBondDisc_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSBond Disc Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSBondDisc_DiscrepancyTypeCode` | Enum/lookup code selected from sys_WMSBondedDiscrepancyTypes. | WMSBond Disc Discrepancy Type Code; Discrepancy Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBondedDiscrepancyTypes.WMSBondedDiscrepancyType_Code | **ENUM** `sys_WMSBondedDiscrepancyTypes`: `over = Over`, `short = Short`, `damage = Damage`, `wrong_status = Wrong customs status`, `wrong_location = Wrong location`, `documentation = Documentation issue`, `reconciliation = Reconciliation issue` |  |
| `WMSBondDisc_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Disc Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |
| `WMSBondDisc_ExpectedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Disc Expected Quantity; Expected Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSBondDisc_ActualQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Disc Actual Quantity; Actual Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSBondDisc_CustomsNotificationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Disc Customs Notification Reference; Customs Notification Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondDisc_Description` | Description shown in forms, grids or support screens. | WMSBond Disc Description; Description; details | `text` |  | Yes |  |  |  |
| `WMSBondDisc_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSBond Disc Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSBondDisc_CreatedAt` | Timestamp/date when the row was created. | WMSBond Disc Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondDisc_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Disc Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedEntries`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bonded warehouse entry/admission headers linked to jobs, orders, declarations, depositors, importers and guarantee exposure.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondEntry_ID` | Primary identifier for the wms bonded entries row. | WMSBond Entry ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondEntry_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Entry Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondEntry_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Entry Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondEntry_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSBond Entry Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSBondEntry_JobID` | Links this row to Job_Header.Job_ID. | WMSBond Entry Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSBondEntry_DepositorOrgID` | Links this row to Org_Master.Org_ID. | WMSBond Entry Depositor Org ID; Depositor Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBondEntry_ImporterOrgID` | Links this row to Org_Master.Org_ID. | WMSBond Entry Importer Org ID; Importer Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBondEntry_EntryReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Entry Entry Reference; Entry Reference; reference; external reference | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSBondEntry_DeclarationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Entry Declaration Reference; Declaration Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondEntry_ProcedureTypeCode` | Enum/lookup code selected from sys_WMSBondedProcedureTypes. | WMSBond Entry Procedure Type Code; Procedure Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBondedProcedureTypes.WMSBondedProcedureType_Code | **ENUM** `sys_WMSBondedProcedureTypes`: `customs_warehousing = Customs warehousing`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspension = Excise suspension`, `free_circulation = Free circulation`, `re_export = Re-export`, `destruction = Destruction` |  |
| `WMSBondEntry_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSBond Entry Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'bonded'::character varying` |
| `WMSBondEntry_AdmissionDate` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Entry Admission Date; Admission Date | `date` | date | Yes |  |  | `CURRENT_DATE` |
| `WMSBondEntry_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Entry Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |
| `WMSBondEntry_GuaranteeID` | Links this row to WMS_BondedGuarantees.WMSBondGuarantee_ID. | WMSBond Entry Guarantee ID; Guarantee ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedGuarantees.WMSBondGuarantee_ID |  |  |
| `WMSBondEntry_TotalCustomsValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Total Customs Value; Total Customs Value; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntry_TotalDutyEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Total Duty Estimate; Total Duty Estimate; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntry_TotalTaxEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Total Tax Estimate; Total Tax Estimate; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntry_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSBondEntry_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Entry Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSBondEntry_CreatedAt` | Timestamp/date when the row was created. | WMSBond Entry Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondEntry_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Entry Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedEntryLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores bonded entry line data including HS code, origin, quantity, weight, customs value, duty/tax estimate and restrictions.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondEntryLine_ID` | Primary identifier for the wms bonded entry lines row. | WMSBond Entry Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondEntryLine_EntryID` | Links this row to WMS_BondedEntries.WMSBondEntry_ID. | WMSBond Entry Line Entry ID; Entry ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_BondedEntries.WMSBondEntry_ID |  |  |
| `WMSBondEntryLine_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSBond Entry Line Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSBondEntryLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSBond Entry Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSBondEntryLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Entry Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSBondEntryLine_HSCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Line HSCode; HSCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSBondEntryLine_GoodsDescription` | Description shown in forms, grids or support screens. | WMSBond Entry Line Goods Description; Goods Description; description; details | `text` |  | No |  |  |  |
| `WMSBondEntryLine_CountryOfOriginCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Line Country Of Origin Code; Country Of Origin Code; code; lookup code; country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `WMSBondEntryLine_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Entry Line Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondEntryLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSBondEntryLine_GrossWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Entry Line Gross Weight KG; Gross Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSBondEntryLine_NetWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Entry Line Net Weight KG; Net Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSBondEntryLine_CustomsValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Line Customs Value; Customs Value; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntryLine_DutyEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Line Duty Estimate; Duty Estimate | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntryLine_TaxEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Line Tax Estimate; Tax Estimate | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondEntryLine_LicenseReference` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Entry Line License Reference; License Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondEntryLine_RestrictionFlagsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Entry Line Restriction Flags JSON; Restriction Flags JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSBondEntryLine_RemainingQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Entry Line Remaining Quantity; Remaining Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |

### `WMS_BondedEquivalenceRules`

Function: Configuration table that defines behaviour, reusable rules, governed templates or versioned setup.

Reason for existence: Exists to let administrators change business behaviour by configuration rather than custom code, while keeping versions and approval history traceable.

Purpose: Stores authorised equivalence/FIFO/specific-identification rules for bonded stock where permitted.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondEquiv_ID` | Primary identifier for the wms bonded equivalence rules row. | WMSBond Equiv ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondEquiv_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Equiv Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondEquiv_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSBond Equiv Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSBondEquiv_HSCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Equiv HSCode; HSCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSBondEquiv_OriginCountryCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Equiv Origin Country Code; Origin Country Code; code; lookup code; country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `WMSBondEquiv_AllowedMethodCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Equiv Allowed Method Code; Allowed Method Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'specific_identification'::character varying` |
| `WMSBondEquiv_RestrictionJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBond Equiv Restriction JSON; Restriction JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSBondEquiv_IsActive` | Availability flag for new use in the application. | WMSBond Equiv Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_BondedGuarantees`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bonded/customs guarantee references, providers, limits, used amounts and validity.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondGuarantee_ID` | Primary identifier for the wms bonded guarantees row. | WMSBond Guarantee ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondGuarantee_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Guarantee Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondGuarantee_Reference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Guarantee Reference; Reference; external reference | `character varying(120)` | 120 chars | Yes |  |  |  |
| `WMSBondGuarantee_ProviderOrgID` | Links this row to Org_Master.Org_ID. | WMSBond Guarantee Provider Org ID; Provider Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBondGuarantee_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Guarantee Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSBondGuarantee_LimitAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Guarantee Limit Amount; Limit Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondGuarantee_UsedAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Guarantee Used Amount; Used Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondGuarantee_ValidFrom` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Guarantee Valid From; Valid From | `date` | date | No |  |  |  |
| `WMSBondGuarantee_ValidTo` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Guarantee Valid To; Valid To | `date` | date | No |  |  |  |
| `WMSBondGuarantee_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Guarantee Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'active'::character varying` |
| `WMSBondGuarantee_CreatedAt` | Timestamp/date when the row was created. | WMSBond Guarantee Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_BondedInventoryLinks`

Function: Relationship bridge table that connects one business record to another without duplicating the master data.

Reason for existence: Exists to keep many-to-many or scoped relationships explicit, searchable and auditable instead of embedding repeated IDs or JSON arrays in the parent table.

Purpose: Links bonded entry lines to live inventory balances, lots and handling units so customs stock can be reconciled.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user asks to connect, share, scope, map or associate two records. Confirm both endpoints before creating or deleting links.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondInvLink_ID` | Primary identifier for the wms bonded inventory links row. | WMSBond Inv Link ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondInvLink_EntryID` | Links this row to WMS_BondedEntries.WMSBondEntry_ID. | WMSBond Inv Link Entry ID; Entry ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedEntries.WMSBondEntry_ID |  |  |
| `WMSBondInvLink_EntryLineID` | Links this row to WMS_BondedEntryLines.WMSBondEntryLine_ID. | WMSBond Inv Link Entry Line ID; Entry Line ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_BondedEntryLines.WMSBondEntryLine_ID |  |  |
| `WMSBondInvLink_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSBond Inv Link Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSBondInvLink_LotID` | Links this row to WMS_InventoryLots.WMSLot_ID. | WMSBond Inv Link Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryLots.WMSLot_ID |  |  |
| `WMSBondInvLink_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSBond Inv Link HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSBondInvLink_LinkedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Inv Link Linked Quantity; Linked Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondInvLink_RemainingQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Inv Link Remaining Quantity; Remaining Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondInvLink_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Inv Link UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSBondInvLink_CreatedAt` | Timestamp/date when the row was created. | WMSBond Inv Link Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_BondedMovements`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bonded stock movements such as admission, internal move, usual handling, temporary removal, withdrawal and destruction.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondMove_ID` | Primary identifier for the wms bonded movements row. | WMSBond Move ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondMove_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Move Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondMove_EntryID` | Links this row to WMS_BondedEntries.WMSBondEntry_ID. | WMSBond Move Entry ID; Entry ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntries.WMSBondEntry_ID |  |  |
| `WMSBondMove_EntryLineID` | Links this row to WMS_BondedEntryLines.WMSBondEntryLine_ID. | WMSBond Move Entry Line ID; Entry Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntryLines.WMSBondEntryLine_ID |  |  |
| `WMSBondMove_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSBond Move Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSBondMove_TransactionID` | Links this row to WMS_InventoryTransactions.WMSTransaction_ID. | WMSBond Move Transaction ID; Transaction ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryTransactions.WMSTransaction_ID |  |  |
| `WMSBondMove_MovementTypeCode` | Enum/lookup code selected from sys_WMSBondedMovementTypes. | WMSBond Move Movement Type Code; Movement Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBondedMovementTypes.WMSBondedMovementType_Code | **ENUM** `sys_WMSBondedMovementTypes`: `admission = Admission`, `internal_move = Internal move`, `status_change = Status change`, `usual_handling = Usual handling`, `temporary_removal = Temporary removal`, `return_from_temporary_removal = Return from temporary removal`, `withdrawal = Withdrawal/removal`, `destruction = Destruction` |  |
| `WMSBondMove_MovementReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Move Movement Reference; Movement Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondMove_FromLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSBond Move From Location ID; From Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSBondMove_ToLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSBond Move To Location ID; To Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSBondMove_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Move Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondMove_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Move UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSBondMove_MovementAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Move Movement At; Movement At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondMove_CustomsNotificationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Move Customs Notification Reference; Customs Notification Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondMove_Notes` | Free-text content entered by users or generated by the system. | WMSBond Move Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSBondMove_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Move Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedReconciliations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores periodic bonded stock reconciliation runs, quantities, discrepancy counts and report links.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondRecon_ID` | Primary identifier for the wms bonded reconciliations row. | WMSBond Recon ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondRecon_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Recon Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondRecon_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Recon Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondRecon_PeriodStartDate` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Recon Period Start Date; Period Start Date | `date` | date | Yes |  |  |  |
| `WMSBondRecon_PeriodEndDate` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Recon Period End Date; Period End Date | `date` | date | Yes |  |  |  |
| `WMSBondRecon_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Recon Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'draft'::character varying` |
| `WMSBondRecon_SystemQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Recon System Quantity; System Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondRecon_CountedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Recon Counted Quantity; Counted Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondRecon_DiscrepancyQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Recon Discrepancy Quantity; Discrepancy Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondRecon_DiscrepancyCount` | WMSBond Recon Discrepancy Count field for wms bonded reconciliations. | WMSBond Recon Discrepancy Count; Discrepancy Count | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |
| `WMSBondRecon_ReportDocumentID` | WMSBond Recon Report Document ID field for wms bonded reconciliations. | WMSBond Recon Report Document ID; Report Document ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSBondRecon_SubmittedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Recon Submitted At; Submitted At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondRecon_ApprovedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Recon Approved At; Approved At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondRecon_CreatedAt` | Timestamp/date when the row was created. | WMSBond Recon Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondRecon_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Recon Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedRemovalLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores bonded removal line quantities, customs value and estimated duty/tax due.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondRemovalLine_ID` | Primary identifier for the wms bonded removal lines row. | WMSBond Removal Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondRemovalLine_RemovalID` | Links this row to WMS_BondedRemovals.WMSBondRemoval_ID. | WMSBond Removal Line Removal ID; Removal ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_BondedRemovals.WMSBondRemoval_ID |  |  |
| `WMSBondRemovalLine_EntryLineID` | Links this row to WMS_BondedEntryLines.WMSBondEntryLine_ID. | WMSBond Removal Line Entry Line ID; Entry Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntryLines.WMSBondEntryLine_ID |  |  |
| `WMSBondRemovalLine_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSBond Removal Line Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSBondRemovalLine_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSBond Removal Line Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSBondRemovalLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSBond Removal Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSBondRemovalLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Removal Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSBondRemovalLine_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Removal Line Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBondRemovalLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Removal Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSBondRemovalLine_CustomsValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Removal Line Customs Value; Customs Value; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondRemovalLine_DutyDueAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Removal Line Duty Due Amount; Duty Due Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondRemovalLine_TaxDueAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Removal Line Tax Due Amount; Tax Due Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | Yes |  |  | `0` |
| `WMSBondRemovalLine_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Removal Line Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |

### `WMS_BondedRemovals`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bonded removal/withdrawal headers for free circulation, re-export, transfer, temporary removal, destruction or other approved discharge.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondRemoval_ID` | Primary identifier for the wms bonded removals row. | WMSBond Removal ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondRemoval_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBond Removal Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBondRemoval_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSBond Removal Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSBondRemoval_JobID` | Links this row to Job_Header.Job_ID. | WMSBond Removal Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSBondRemoval_RemovalNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Removal Removal Number; Removal Number; number; reference | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSBondRemoval_RemovalTypeCode` | Enum/lookup code selected from sys_WMSBondedRemovalTypes. | WMSBond Removal Removal Type Code; Removal Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBondedRemovalTypes.WMSBondedRemovalType_Code | **ENUM** `sys_WMSBondedRemovalTypes`: `free_circulation = Release to free circulation`, `re_export = Re-export`, `transfer_to_bonded = Transfer to bonded warehouse`, `inward_processing = Discharge to inward processing`, `temporary_removal = Temporary removal`, `destruction = Destruction`, `other = Other` |  |
| `WMSBondRemoval_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Removal Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'draft'::character varying` |
| `WMSBondRemoval_DeclarationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Removal Declaration Reference; Declaration Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondRemoval_CustomsReleaseReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Removal Customs Release Reference; Customs Release Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondRemoval_DestinationOrgID` | Links this row to Org_Master.Org_ID. | WMSBond Removal Destination Org ID; Destination Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBondRemoval_RemovalRequestedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Removal Removal Requested At; Removal Requested At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondRemoval_RemovedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Removal Removed At; Removed At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondRemoval_RequiresFinanceRelease` | WMSBond Removal Requires Finance Release field for wms bonded removals. | WMSBond Removal Requires Finance Release; Requires Finance Release | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBondRemoval_RequiresComplianceRelease` | WMSBond Removal Requires Compliance Release field for wms bonded removals. | WMSBond Removal Requires Compliance Release; Requires Compliance Release | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondRemoval_Notes` | Free-text content entered by users or generated by the system. | WMSBond Removal Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSBondRemoval_CreatedAt` | Timestamp/date when the row was created. | WMSBond Removal Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBondRemoval_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSBond Removal Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_BondedTemporaryRemovals`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores temporary removals from bonded control, due-back dates, permission references and return status.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondTempRemoval_ID` | Primary identifier for the wms bonded temporary removals row. | WMSBond Temp Removal ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondTempRemoval_RemovalID` | Links this row to WMS_BondedRemovals.WMSBondRemoval_ID. | WMSBond Temp Removal Removal ID; Removal ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedRemovals.WMSBondRemoval_ID |  |  |
| `WMSBondTempRemoval_EntryID` | Links this row to WMS_BondedEntries.WMSBondEntry_ID. | WMSBond Temp Removal Entry ID; Entry ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_BondedEntries.WMSBondEntry_ID |  |  |
| `WMSBondTempRemoval_AuthorityPermissionReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Temp Removal Authority Permission Reference; Authority Permission Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBondTempRemoval_Reason` | WMSBond Temp Removal Reason field for wms bonded temporary removals. | WMSBond Temp Removal Reason; Reason | `text` |  | Yes |  |  |  |
| `WMSBondTempRemoval_RemovedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Temp Removal Removed At; Removed At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondTempRemoval_DueBackAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Temp Removal Due Back At; Due Back At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondTempRemoval_ReturnedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBond Temp Removal Returned At; Returned At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBondTempRemoval_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Temp Removal Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |
| `WMSBondTempRemoval_EscortedByUserID` | Links this row to cmp_Users.User_ID. | WMSBond Temp Removal Escorted By User ID; Escorted By User ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSBondTempRemoval_Notes` | Free-text content entered by users or generated by the system. | WMSBond Temp Removal Notes; Notes; comments | `text` |  | No |  |  |  |

### `WMS_BondedUsualHandling`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores authorised usual forms of handling allowed under the bonded/customs warehouse authorisation.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondHandling_ID` | Primary identifier for the wms bonded usual handling row. | WMSBond Handling ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBondHandling_AuthorisationID` | Links this row to WMS_BondedAuthorisations.WMSBondAuth_ID. | WMSBond Handling Authorisation ID; Authorisation ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_BondedAuthorisations.WMSBondAuth_ID |  |  |
| `WMSBondHandling_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Handling Code; Code; lookup code | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSBondHandling_Name` | Human-readable name or title displayed to users. | WMSBond Handling Name; Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSBondHandling_Description` | Description shown in forms, grids or support screens. | WMSBond Handling Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondHandling_RequiresPriorApproval` | WMSBond Handling Requires Prior Approval field for wms bonded usual handling. | WMSBond Handling Requires Prior Approval; Requires Prior Approval | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBondHandling_IsActive` | Availability flag for new use in the application. | WMSBond Handling Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_CustomerFacilityAccess`

Function: Relationship bridge table connecting a customer organisation to explicitly assigned warehouse facilities.

Purpose: Provides the tenant boundary used by customer portal APIs. A customer can only view or create warehouse records where both the customer organisation and facility are assigned and active.

Primary UI/API use: Managed from the Warehouse customer access panel on a customer account. Always combine this scope with portal role permissions; facility access alone does not grant an action.

| Field | Purpose | Type | Required | Key / Relation | Default |
|---|---|---|---|---|---|
| `WMSCustomerFacilityAccess_ID` | Primary identifier. | `uuid` | Yes | PK | `gen_random_uuid()` |
| `WMSCustomerFacilityAccess_CustomerOrgID` | Customer organisation receiving access. | `uuid` | Yes | Unique group; FK -> Org_Master.Org_ID | |
| `WMSCustomerFacilityAccess_FacilityID` | Warehouse facility the customer may use. | `uuid` | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID | |
| `WMSCustomerFacilityAccess_IsActive` | Enables or suspends the customer/facility scope. | `boolean` | Yes | | `true` |
| `WMSCustomerFacilityAccess_CreatedAt` | Creation timestamp. | `timestamp with time zone` | Yes | | `now()` |
| `WMSCustomerFacilityAccess_CreatedBy` | Internal user who assigned access. | `uuid` | No | FK -> cmp_Users.User_ID | |
| `WMSCustomerFacilityAccess_UpdatedAt` | Last update timestamp. | `timestamp with time zone` | Yes | | `now()` |

### `WMS_CustomerProfiles`

Function: Configuration table that defines behaviour, reusable rules, governed templates or versioned setup.

Reason for existence: Exists to let administrators change business behaviour by configuration rather than custom code, while keeping versions and approval history traceable.

Purpose: Stores warehouse customer rules, default facility, allocation/pick method, portal stock visibility, ASN requirements and bonded-stock permission.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCustomerProfile_ID` | Primary identifier for the wms customer profiles row. | WMSCustomer Profile ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSCustomerProfile_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSCustomer Profile Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> Org_Master.Org_ID |  |  |
| `WMSCustomerProfile_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSCustomer Profile Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | No | Unique group; FK -> cmp_Offices.Office_ID |  |  |
| `WMSCustomerProfile_DefaultFacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSCustomer Profile Default Facility ID; Default Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSCustomerProfile_CustomerCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCustomer Profile Customer Code; Customer Code; code; lookup code; customer; client | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSCustomerProfile_DefaultAllocationMethodCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCustomer Profile Default Allocation Method Code; Default Allocation Method Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'fifo'::character varying` |
| `WMSCustomerProfile_DefaultPickMethodCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCustomer Profile Default Pick Method Code; Default Pick Method Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'fifo'::character varying` |
| `WMSCustomerProfile_PortalStockVisible` | WMSCustomer Profile Portal Stock Visible field for wms customer profiles. | WMSCustomer Profile Portal Stock Visible; Portal Stock Visible | `boolean` | true/false | Yes |  |  | `true` |
| `WMSCustomerProfile_AllowsBondedStock` | WMSCustomer Profile Allows Bonded Stock field for wms customer profiles. | WMSCustomer Profile Allows Bonded Stock; Allows Bonded Stock | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCustomerProfile_RequiresASN` | WMSCustomer Profile Requires ASN field for wms customer profiles. | WMSCustomer Profile Requires ASN; Requires ASN | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCustomerProfile_LabelStandardCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCustomer Profile Label Standard Code; Label Standard Code; code; lookup code | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSCustomerProfile_RulesJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSCustomer Profile Rules JSON; Rules JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSCustomerProfile_IsActive` | Availability flag for new use in the application. | WMSCustomer Profile Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSCustomerProfile_CreatedAt` | Timestamp/date when the row was created. | WMSCustomer Profile Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSCustomerProfile_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSCustomer Profile Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSCustomerProfile_UpdatedAt` | Timestamp/date when the row was last changed. | WMSCustomer Profile Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_CycleCountLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores counted stock lines, system quantity, counted quantity and variance.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCountLine_ID` | Primary identifier for the wms cycle count lines row. | WMSCount Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSCountLine_CountPlanID` | Links this row to WMS_CycleCountPlans.WMSCountPlan_ID. | WMSCount Line Count Plan ID; Count Plan ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_CycleCountPlans.WMSCountPlan_ID |  |  |
| `WMSCountLine_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSCount Line Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSCountLine_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSCount Line Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSCountLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSCount Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSCountLine_SystemQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSCount Line System Quantity; System Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSCountLine_CountedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSCount Line Counted Quantity; Counted Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSCountLine_VarianceQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSCount Line Variance Quantity; Variance Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSCountLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCount Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSCountLine_StatusCode` | Enum/lookup code selected from sys_WMSCycleCountStatuses. | WMSCount Line Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WMSCycleCountStatuses`: `planned = Planned`, `in_progress = In progress`, `variance_review = Variance review`, `approved = Approved`, `posted = Posted`, `cancelled = Cancelled` | `'planned'::character varying` |
| `WMSCountLine_CountedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSCount Line Counted At; Counted At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSCountLine_CountedBy` | Links this row to cmp_Users.User_ID. | WMSCount Line Counted By; Counted By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSCountLine_Notes` | Free-text content entered by users or generated by the system. | WMSCount Line Notes; Notes; comments | `text` |  | No |  |  |  |

### `WMS_CycleCountPlans`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores physical/cycle count plans by facility, customer, zone and planned dates.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCountPlan_ID` | Primary identifier for the wms cycle count plans row. | WMSCount Plan ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSCountPlan_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSCount Plan Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSCountPlan_Name` | Human-readable name or title displayed to users. | WMSCount Plan Name; Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSCountPlan_StatusCode` | Enum/lookup code selected from sys_WMSCycleCountStatuses. | WMSCount Plan Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCycleCountStatuses.WMSCycleCountStatus_Code | **ENUM** `sys_WMSCycleCountStatuses`: `planned = Planned`, `in_progress = In progress`, `variance_review = Variance review`, `approved = Approved`, `posted = Posted`, `cancelled = Cancelled` | `'planned'::character varying` |
| `WMSCountPlan_CountTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSCount Plan Count Type Code; Count Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'location'::character varying` |
| `WMSCountPlan_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSCount Plan Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSCountPlan_ZoneID` | Links this row to WMS_Zones.WMSZone_ID. | WMSCount Plan Zone ID; Zone ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Zones.WMSZone_ID |  |  |
| `WMSCountPlan_PlannedStartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSCount Plan Planned Start At; Planned Start At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSCountPlan_PlannedEndAt` | Date/time used for workflow, validity, routing or external reporting. | WMSCount Plan Planned End At; Planned End At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSCountPlan_CreatedAt` | Timestamp/date when the row was created. | WMSCount Plan Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSCountPlan_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSCount Plan Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_Dispatches`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse dispatch headers linked to outbound orders, jobs, carriers, vehicles, containers and POD documents.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSDispatch_ID` | Primary identifier for the wms dispatches row. | WMSDispatch ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSDispatch_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSDispatch Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSDispatch_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSDispatch Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSDispatch_JobID` | Links this row to Job_Header.Job_ID. | WMSDispatch Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSDispatch_DispatchNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSDispatch Dispatch Number; Dispatch Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSDispatch_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSDispatch Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'planned'::character varying` |
| `WMSDispatch_DockID` | Links this row to WMS_Docks.WMSDock_ID. | WMSDispatch Dock ID; Dock ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Docks.WMSDock_ID |  |  |
| `WMSDispatch_CarrierOrgID` | Links this row to Org_Master.Org_ID. | WMSDispatch Carrier Org ID; Carrier Org ID; organisation; company; party; carrier; shipping line; airline; haulier; id | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSDispatch_VehicleReg` | WMSDispatch Vehicle Reg field for wms dispatches. | WMSDispatch Vehicle Reg; Vehicle Reg | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSDispatch_ContainerNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSDispatch Container Number; Container Number; number; reference | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSDispatch_SealNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSDispatch Seal Number; Seal Number; number; reference | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSDispatch_DispatchedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSDispatch Dispatched At; Dispatched At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSDispatch_DispatchedBy` | Links this row to cmp_Users.User_ID. | WMSDispatch Dispatched By; Dispatched By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSDispatch_PODDocumentID` | Links this row to Job_Documents.JobDoc_ID. | WMSDispatch PODDocument ID; PODDocument ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Documents.JobDoc_ID |  |  |
| `WMSDispatch_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSDispatch Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSDispatch_CreatedAt` | Timestamp/date when the row was created. | WMSDispatch Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Docks`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores inbound and outbound dock doors/slots used for warehouse appointments and loading/unloading.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSDock_ID` | Primary identifier for the wms docks row. | WMSDock ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSDock_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSDock Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSDock_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSDock Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSDock_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSDock Code; Code; lookup code | `character varying(50)` | 50 chars | Yes | Unique group |  |  |
| `WMSDock_Name` | Human-readable name or title displayed to users. | WMSDock Name; Name | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSDock_DirectionCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSDock Direction Code; Direction Code; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'both'::character varying` |
| `WMSDock_StatusCode` | Enum/lookup code selected from sys_WMSLocationStatuses. | WMSDock Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSLocationStatuses.WMSLocationStatus_Code | **ENUM** `sys_WMSLocationStatuses`: `available = Available`, `occupied = Occupied`, `full = Full`, `blocked = Blocked`, `maintenance = Maintenance`, `customs_locked = Customs locked`, `inactive = Inactive` | `'available'::character varying` |
| `WMSDock_AppointmentRequired` | WMSDock Appointment Required field for wms docks. | WMSDock Appointment Required; Appointment Required | `boolean` | true/false | Yes |  |  | `false` |
| `WMSDock_MaxVehicleLengthM` | Cargo measurement used for operational, rating, customs or document output. | WMSDock Max Vehicle Length M; Max Vehicle Length M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSDock_IsActive` | Availability flag for new use in the application. | WMSDock Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSDock_CreatedAt` | Timestamp/date when the row was created. | WMSDock Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Documents`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Links WMS operational documents to Job_Documents, generated document builder outputs, QR/security references and file metadata.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSDocument_ID` | Primary identifier for the wms documents row. | WMSDocument ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSDocument_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSDocument Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSDocument_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSDocument Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSDocument_JobID` | Links this row to Job_Header.Job_ID. | WMSDocument Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSDocument_JobDocumentID` | Links this row to Job_Documents.JobDoc_ID. | WMSDocument Job Document ID; Job Document ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Documents.JobDoc_ID |  |  |
| `WMSDocument_GeneratedDocumentID` | Links this row to DOCB_GeneratedDocuments.DOCBGD_ID. | WMSDocument Generated Document ID; Generated Document ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> DOCB_GeneratedDocuments.DOCBGD_ID |  |  |
| `WMSDocument_DocumentTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSDocument Document Type Code; Document Type Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSDocument_Title` | Human-readable name or title displayed to users. | WMSDocument Title; Title | `character varying(220)` | 220 chars | Yes |  |  |  |
| `WMSDocument_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSDocument Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'draft'::character varying` |
| `WMSDocument_FileRef` | WMSDocument File Ref field for wms documents. | WMSDocument File Ref; File Ref; reference; external reference | `text` |  | No |  |  |  |
| `WMSDocument_FileHash` | Hash used to detect duplicate/changed content or support retrieval integrity. | WMSDocument File Hash; File Hash | `character varying(128)` | 128 chars | No |  |  |  |
| `WMSDocument_QRVerificationTokenID` | WMSDocument QRVerification Token ID field for wms documents. | WMSDocument QRVerification Token ID; QRVerification Token ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSDocument_CreatedAt` | Timestamp/date when the row was created. | WMSDocument Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSDocument_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSDocument Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_Equipment`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse equipment such as forklifts, scanners and handling equipment for assignment, certification and task planning.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSEquipment_ID` | Primary identifier for the wms equipment row. | WMSEquipment ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSEquipment_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSEquipment Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSEquipment_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSEquipment Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | Unique group |  |  |
| `WMSEquipment_Name` | Human-readable name or title displayed to users. | WMSEquipment Name; Name | `character varying(160)` | 160 chars | Yes |  |  |  |
| `WMSEquipment_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSEquipment Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSEquipment_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSEquipment Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'available'::character varying` |
| `WMSEquipment_MaxWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSEquipment Max Weight KG; Max Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSEquipment_CertificationExpiryDate` | Date/time used for workflow, validity, routing or external reporting. | WMSEquipment Certification Expiry Date; Certification Expiry Date | `date` | date | No |  |  |  |
| `WMSEquipment_SettingsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSEquipment Settings JSON; Settings JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSEquipment_IsActive` | Availability flag for new use in the application. | WMSEquipment Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSEquipment_CreatedAt` | Timestamp/date when the row was created. | WMSEquipment Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_ExceptionActions`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores actions required to resolve warehouse exceptions.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSExceptionAction_ID` | Primary identifier for the wms exception actions row. | WMSException Action ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSExceptionAction_ExceptionID` | Links this row to WMS_Exceptions.WMSException_ID. | WMSException Action Exception ID; Exception ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Exceptions.WMSException_ID |  |  |
| `WMSExceptionAction_ActionTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSException Action Action Type Code; Action Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSExceptionAction_ActionText` | Free-text content entered by users or generated by the system. | WMSException Action Action Text; Action Text | `text` |  | Yes |  |  |  |
| `WMSExceptionAction_ActionStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSException Action Action Status Code; Action Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |
| `WMSExceptionAction_OwnerUserID` | Links this row to cmp_Users.User_ID. | WMSException Action Owner User ID; Owner User ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSExceptionAction_DueAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Action Due At; Due At; due date; deadline | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSExceptionAction_CompletedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Action Completed At; Completed At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSExceptionAction_CreatedAt` | Timestamp/date when the row was created. | WMSException Action Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Exceptions`

Function: Control and review table for operational blocks, exceptions, approval decisions and human review workflows.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse operational exceptions linked to jobs, orders, tasks, receipts, balances and workflow tasks.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user asks about blocks, exceptions, approvals, problems, disputes or review decisions. Preserve decision reason and user audit.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSException_ID` | Primary identifier for the wms exceptions row. | WMSException ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSException_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSException Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSException_TypeCode` | Enum/lookup code selected from sys_WMSExceptionTypes. | WMSException Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSExceptionTypes.WMSExceptionType_Code | **ENUM** `sys_WMSExceptionTypes`: `over = Over receipt`, `short = Short receipt`, `damage = Damage`, `wrong_item = Wrong item`, `wrong_location = Wrong location`, `temperature_breach = Temperature breach`, `customs_issue = Customs issue`, `compliance_issue = Compliance issue`, `credit_hold = Credit hold`, `system_error = System error` |  |
| `WMSException_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSException Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'open'::character varying` |
| `WMSException_SeverityCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSException Severity Code; Severity Code; code; lookup code | `character varying(30)` | 30 chars | Yes |  |  | `'medium'::character varying` |
| `WMSException_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSException Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSException_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSException Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSException_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSException Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSException_ReceiptID` | Links this row to WMS_Receipts.WMSReceipt_ID. | WMSException Receipt ID; Receipt ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Receipts.WMSReceipt_ID |  |  |
| `WMSException_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSException Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSException_JobID` | Links this row to Job_Header.Job_ID. | WMSException Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSException_Title` | Human-readable name or title displayed to users. | WMSException Title; Title | `character varying(220)` | 220 chars | Yes |  |  |  |
| `WMSException_Description` | Description shown in forms, grids or support screens. | WMSException Description; Description; details | `text` |  | No |  |  |  |
| `WMSException_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSException Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSException_RaisedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Raised At; Raised At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSException_RaisedBy` | Links this row to cmp_Users.User_ID. | WMSException Raised By; Raised By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSException_ResolvedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Resolved At; Resolved At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSException_ResolvedBy` | Links this row to cmp_Users.User_ID. | WMSException Resolved By; Resolved By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSException_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSException Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |

### `WMS_Facilities`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse facility master data for freight, 3PL, fulfilment, cross-dock and bonded/customs-controlled operations. Links to existing Warehouse records without replacing them.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSFacility_ID` | Primary identifier for the wms facilities row. | WMSFacility ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSFacility_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility Code; Code; lookup code | `character varying(40)` | 40 chars | Yes | Unique group |  |  |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSFacility_TypeCode` | Enum/lookup code selected from sys_WMSFacilityTypes. | WMSFacility Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSFacilityTypes.WMSFacilityType_Code | **ENUM** `sys_WMSFacilityTypes`: `freight_warehouse = Freight warehouse`, `third_party_logistics = 3PL warehouse`, `fulfilment = Fulfilment centre`, `crossdock = Cross-dock`, `bonded_warehouse = Bonded/customs warehouse`, `free_zone = Free zone`, `cold_chain = Cold-chain warehouse`, `yard = Yard/depot` |  |
| `WMSFacility_LegacyWarehouseID` | Links this row to Warehouse.Id. | WMSFacility Legacy Warehouse ID; Legacy Warehouse ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Warehouse.Id |  |  |
| `WMSFacility_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSFacility Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Offices.Office_ID |  |  |
| `WMSFacility_OperatorOrgID` | Links this row to Org_Master.Org_ID. | WMSFacility Operator Org ID; Operator Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSFacility_OwnerOrgID` | Links this row to Org_Master.Org_ID. | WMSFacility Owner Org ID; Owner Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSFacility_UNLOCODE` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility UNLOCODE; UNLOCODE; code; lookup code | `character varying(5)` | 5 chars | No |  |  |  |
| `WMSFacility_Address1` | Address/location text used for parties, offices or legal snapshots. | WMSFacility Address1; Address1 | `character varying(180)` | 180 chars | No |  |  |  |
| `WMSFacility_Address2` | Address/location text used for parties, offices or legal snapshots. | WMSFacility Address2; Address2 | `character varying(180)` | 180 chars | No |  |  |  |
| `WMSFacility_TownCity` | Address/location text used for parties, offices or legal snapshots. | WMSFacility Town City; Town City; location; place | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSFacility_CountyState` | Address/location text used for parties, offices or legal snapshots. | WMSFacility County State; County State | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSFacility_PostZipCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility Post Zip Code; Post Zip Code; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSFacility_CountryCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility Country Code; Country Code; code; lookup code; country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `WMSFacility_TimeZone` | Date/time used for workflow, validity, routing or external reporting. | WMSFacility Time Zone; Time Zone | `character varying(80)` | 80 chars | Yes |  |  | `'UTC'::character varying` |
| `WMSFacility_IsBonded` | WMSFacility Is Bonded field for wms facilities. | WMSFacility Is Bonded; Is Bonded | `boolean` | true/false | Yes |  |  | `false` |
| `WMSFacility_DefaultCustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSFacility Default Customs Status Code; Default Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSFacility_SettingsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSFacility Settings JSON; Settings JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSFacility_IsActive` | Availability flag for new use in the application. | WMSFacility Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSFacility_CreatedAt` | Timestamp/date when the row was created. | WMSFacility Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSFacility_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSFacility Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSFacility_UpdatedAt` | Timestamp/date when the row was last changed. | WMSFacility Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSFacility_UpdatedBy` | Links this row to cmp_Users.User_ID. | WMSFacility Updated By; Updated By; updated date; modified date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSFacility_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSFacility Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_FacilityCapabilities`

Function: Relationship bridge table that connects one business record to another without duplicating the master data.

Reason for existence: Exists to keep many-to-many or scoped relationships explicit, searchable and auditable instead of embedding repeated IDs or JSON arrays in the parent table.

Purpose: Stores facility capabilities such as bonded storage, dangerous goods, cold chain, customs inspection and value-added services.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSFacilityCap_ID` | Primary identifier for the wms facility capabilities row. | WMSFacility Cap ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSFacilityCap_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSFacility Cap Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSFacilityCap_CapabilityCode` | Enum/lookup code selected from sys_WMSFacilityCapabilities. | WMSFacility Cap Capability Code; Capability Code; code; lookup code | `character varying(60)` | 60 chars | Yes | Unique group; FK -> sys_WMSFacilityCapabilities.WMSCapability_Code | **ENUM** `sys_WMSFacilityCapabilities`: `bonded_storage = Bonded storage`, `excise_storage = Excise storage`, `dangerous_goods = Dangerous goods`, `cold_chain = Cold chain`, `pharma = Pharma`, `food = Food`, `ecommerce_fulfilment = E-commerce fulfilment`, `crossdock = Cross-dock`, `container_devanning = Container devanning`, `customs_inspection = Customs inspection`, `value_added_services = Value-added services` |  |
| `WMSFacilityCap_AuthorisationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSFacility Cap Authorisation Reference; Authorisation Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSFacilityCap_ValidFrom` | Date/time used for workflow, validity, routing or external reporting. | WMSFacility Cap Valid From; Valid From | `date` | date | No |  |  |  |
| `WMSFacilityCap_ValidTo` | Date/time used for workflow, validity, routing or external reporting. | WMSFacility Cap Valid To; Valid To | `date` | date | No |  |  |  |
| `WMSFacilityCap_DetailsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSFacility Cap Details JSON; Details JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSFacilityCap_IsActive` | Availability flag for new use in the application. | WMSFacility Cap Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSFacilityCap_CreatedAt` | Timestamp/date when the row was created. | WMSFacility Cap Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_FacilityOffices`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Maps WMS facilities to internal company offices using OrgOfficeID so one facility can serve multiple operating offices or brands.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSFacilityOffice_ID` | Primary identifier for the wms facility offices row. | WMSFacility Office ID; ID; office; branch; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSFacilityOffice_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSFacility Office Facility ID; Facility ID; office; branch; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSFacilityOffice_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSFacility Office Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> cmp_Offices.Office_ID |  |  |
| `WMSFacilityOffice_RoleCode` | Business role used to classify the row in the UI and validation rules. | WMSFacility Office Role Code; Role Code; code; lookup code; office; branch | `character varying(40)` | 40 chars | Yes | Unique group |  | `'operating'::character varying` |
| `WMSFacilityOffice_IsDefault` | Marks the default value within its parent scope. | WMSFacility Office Is Default; Is Default; office; branch | `boolean` | true/false | Yes |  |  | `false` |
| `WMSFacilityOffice_CreatedAt` | Timestamp/date when the row was created. | WMSFacility Office Created At; Created At; office; branch; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSFacilityOffice_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSFacility Office Created By; Created By; office; branch; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_HandlingUnitContents`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores the item, lot, serial, quantity and status contents inside a handling unit.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHUContent_ID` | Primary identifier for the wms handling unit contents row. | WMSHUContent ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSHUContent_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSHUContent HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSHUContent_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSHUContent Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSHUContent_LotID` | Free-text content entered by users or generated by the system. | WMSHUContent Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSHUContent_SerialID` | Free-text content entered by users or generated by the system. | WMSHUContent Serial ID; Serial ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSHUContent_Quantity` | Free-text content entered by users or generated by the system. | WMSHUContent Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSHUContent_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSHUContent UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSHUContent_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSHUContent Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSHUContent_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSHUContent Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSHUContent_CreatedAt` | Timestamp/date when the row was created. | WMSHUContent Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_HandlingUnitEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Stores handling-unit event history such as creation, movement, sealing, nesting, dispatch and exception events.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHUEvent_ID` | Primary identifier for the wms handling unit events row. | WMSHUEvent ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSHUEvent_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSHUEvent HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSHUEvent_EventTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSHUEvent Event Type Code; Event Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSHUEvent_EventAt` | Date/time used for workflow, validity, routing or external reporting. | WMSHUEvent Event At; Event At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSHUEvent_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSHUEvent Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSHUEvent_OrderID` | WMSHUEvent Order ID field for wms handling unit events. | WMSHUEvent Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSHUEvent_JobID` | Links this row to Job_Header.Job_ID. | WMSHUEvent Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSHUEvent_Notes` | Free-text content entered by users or generated by the system. | WMSHUEvent Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSHUEvent_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSHUEvent Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSHUEvent_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSHUEvent Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_HandlingUnits`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores pallets, cartons, containers, LPNs, SSCCs and nested physical units linked to jobs, orders, locations and customs status.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHU_ID` | Primary identifier for the wms handling units row. | WMSHU ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSHU_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSHU Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSHU_ParentHU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSHU Parent HU ID; Parent HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSHU_TypeCode` | Enum/lookup code selected from sys_WMSHandlingUnitTypes. | WMSHU Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSHandlingUnitTypes.WMSHUType_Code | **ENUM** `sys_WMSHandlingUnitTypes`: `pallet = Pallet`, `carton = Carton`, `case = Case`, `tote = Tote`, `container = Container`, `trailer = Trailer`, `parcel = Parcel`, `loose = Loose` |  |
| `WMSHU_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSHU Code; Code; lookup code | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSHU_SSCC` | WMSHU SSCC field for wms handling units. | WMSHU SSCC; SSCC | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSHU_ExternalReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSHU External Reference; External Reference; reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSHU_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSHU Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSHU_JobID` | Links this row to Job_Header.Job_ID. | WMSHU Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSHU_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSHU Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSHU_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSHU Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSHU_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSHU Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSHU_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSHU Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSHU_GrossWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSHU Gross Weight KG; Gross Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSHU_NetWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSHU Net Weight KG; Net Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSHU_VolumeCBM` | Cargo measurement used for operational, rating, customs or document output. | WMSHU Volume CBM; Volume CBM; volume; cube; CBM | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSHU_SealNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSHU Seal Number; Seal Number; number; reference | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSHU_IsSealed` | WMSHU Is Sealed field for wms handling units. | WMSHU Is Sealed; Is Sealed | `boolean` | true/false | Yes |  |  | `false` |
| `WMSHU_CreatedAt` | Timestamp/date when the row was created. | WMSHU Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSHU_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSHU Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSHU_UpdatedAt` | Timestamp/date when the row was last changed. | WMSHU Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSHU_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSHU Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_InboundAdviceLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores expected inbound advice line quantities, lots, expiry and customs status.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAdviceLine_ID` | Primary identifier for the wms inbound advice lines row. | WMSAdvice Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAdviceLine_AdviceID` | Links this row to WMS_InboundAdvices.WMSAdvice_ID. | WMSAdvice Line Advice ID; Advice ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_InboundAdvices.WMSAdvice_ID |  |  |
| `WMSAdviceLine_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSAdvice Line Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSAdviceLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdvice Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSAdviceLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSAdvice Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSAdviceLine_ExpectedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSAdvice Line Expected Quantity; Expected Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSAdviceLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAdvice Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSAdviceLine_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdvice Line Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSAdviceLine_ExpiryDate` | Date/time used for workflow, validity, routing or external reporting. | WMSAdvice Line Expiry Date; Expiry Date | `date` | date | No |  |  |  |
| `WMSAdviceLine_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSAdvice Line Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |

### `WMS_InboundAdvices`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores ASN/inbound advice headers from customers, EDI/API or jobs before physical receipt.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAdvice_ID` | Primary identifier for the wms inbound advices row. | WMSAdvice ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAdvice_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSAdvice Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSAdvice_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSAdvice Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSAdvice_JobID` | Links this row to Job_Header.Job_ID. | WMSAdvice Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSAdvice_EDIMessageID` | Links this row to EDI_Messages.EDIMessage_ID. | WMSAdvice EDIMessage ID; EDIMessage ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> EDI_Messages.EDIMessage_ID |  |  |
| `WMSAdvice_AdviceNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdvice Advice Number; Advice Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSAdvice_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSAdvice Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'booked'::character varying` |
| `WMSAdvice_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSAdvice Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Org_Master.Org_ID |  |  |
| `WMSAdvice_SupplierOrgID` | Links this row to Org_Master.Org_ID. | WMSAdvice Supplier Org ID; Supplier Org ID; organisation; company; party; supplier; vendor; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSAdvice_CarrierOrgID` | Links this row to Org_Master.Org_ID. | WMSAdvice Carrier Org ID; Carrier Org ID; organisation; company; party; carrier; shipping line; airline; haulier; id | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSAdvice_ExpectedArrivalAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAdvice Expected Arrival At; Expected Arrival At; arrival date; arrival time | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSAdvice_ContainerNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdvice Container Number; Container Number; number; reference | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSAdvice_SealNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSAdvice Seal Number; Seal Number; number; reference | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSAdvice_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSAdvice Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSAdvice_CreatedAt` | Timestamp/date when the row was created. | WMSAdvice Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_IntegrationEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Queues WMS integration events from jobs, EDI/API, portals, MultiDeck Exchange, finance, tracking and automation workers.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSEvent_ID` | Primary identifier for the wms integration events row. | WMSEvent ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSEvent_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSEvent Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSEvent_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSEvent Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Offices.Office_ID |  |  |
| `WMSEvent_EventTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSEvent Event Type Code; Event Type Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSEvent_StatusCode` | Enum/lookup code selected from sys_WMSIntegrationEventStatuses. | WMSEvent Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSIntegrationEventStatuses.WMSIntegrationStatus_Code | **ENUM** `sys_WMSIntegrationEventStatuses`: `pending = Pending`, `processing = Processing`, `completed = Completed`, `failed = Failed`, `ignored = Ignored`, `cancelled = Cancelled` | `'pending'::character varying` |
| `WMSEvent_SourceSystemCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSEvent Source System Code; Source System Code; code; lookup code | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSEvent_SourceRecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSEvent Source Record Type Code; Source Record Type Code; code; lookup code | `character varying(60)` | 60 chars | No |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSEvent_SourceRecordID` | Identifier of the linked source/target record. | WMSEvent Source Record ID; Source Record ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSEvent_TargetRecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSEvent Target Record Type Code; Target Record Type Code; code; lookup code | `character varying(60)` | 60 chars | No |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSEvent_TargetRecordID` | Identifier of the linked source/target record. | WMSEvent Target Record ID; Target Record ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSEvent_JobID` | Links this row to Job_Header.Job_ID. | WMSEvent Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSEvent_EDIMessageID` | Links this row to EDI_Messages.EDIMessage_ID. | WMSEvent EDIMessage ID; EDIMessage ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> EDI_Messages.EDIMessage_ID |  |  |
| `WMSEvent_PayloadJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSEvent Payload JSON; Payload JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSEvent_ErrorText` | Free-text content entered by users or generated by the system. | WMSEvent Error Text; Error Text | `text` |  | No |  |  |  |
| `WMSEvent_CreatedAt` | Timestamp/date when the row was created. | WMSEvent Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSEvent_ProcessedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSEvent Processed At; Processed At | `timestamp with time zone` | timestamp | No |  |  |  |

### `WMS_InventoryAllocations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores allocation rows that bind outbound order lines to specific inventory balances.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAllocation_ID` | Primary identifier for the wms inventory allocations row. | WMSAllocation ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSAllocation_ReservationID` | Links this row to WMS_InventoryReservations.WMSReservation_ID. | WMSAllocation Reservation ID; Reservation ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryReservations.WMSReservation_ID |  |  |
| `WMSAllocation_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSAllocation Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSAllocation_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSAllocation Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSAllocation_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSAllocation Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSAllocation_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSAllocation Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSAllocation_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSAllocation UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSAllocation_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSAllocation Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'allocated'::character varying` |
| `WMSAllocation_AllocatedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAllocation Allocated At; Allocated At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSAllocation_PickedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAllocation Picked At; Picked At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSAllocation_ReleasedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSAllocation Released At; Released At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSAllocation_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSAllocation Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_InventoryBalances`

Function: Current-state or summarised balance table used for enquiry and operational control.

Reason for existence: Exists so stock enquiry, availability, bonded stock control and portal views can read current stock quickly without recalculating every movement each time.

Purpose: Stores recalculatable stock balance snapshots by facility, customer, item, location, lot, serial, handling unit, inventory status and customs status.

Primary UI/API use: Use for stock enquiry, availability and portal display. Do not update directly except through controlled balance rebuild/posting routines.

AI agent guidance: Use for answering stock availability questions. If the user asks to change stock, create a transaction, adjustment, receipt, pick or dispatch instead.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBalance_ID` | Primary identifier for the wms inventory balances row. | WMSBalance ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSBalance_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSBalance Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSBalance_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSBalance Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSBalance_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSBalance Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSBalance_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSBalance Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSBalance_LotID` | Links this row to WMS_InventoryLots.WMSLot_ID. | WMSBalance Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryLots.WMSLot_ID |  |  |
| `WMSBalance_SerialID` | Links this row to WMS_InventorySerials.WMSSerial_ID. | WMSBalance Serial ID; Serial ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventorySerials.WMSSerial_ID |  |  |
| `WMSBalance_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSBalance HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSBalance_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSBalance Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSBalance_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSBalance Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSBalance_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBalance UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSBalance_OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance On Hand Quantity; On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBalance_ReservedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Reserved Quantity; Reserved Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBalance_AllocatedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Allocated Quantity; Allocated Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBalance_HeldQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Held Quantity; Held Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBalance_AvailableQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Available Quantity; Available Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSBalance_FirstReceiptAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance First Receipt At; First Receipt At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBalance_LastMovementAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance Last Movement At; Last Movement At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSBalance_IsBonded` | WMSBalance Is Bonded field for wms inventory balances. | WMSBalance Is Bonded; Is Bonded | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBalance_CustomsEntryReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBalance Customs Entry Reference; Customs Entry Reference; reference; external reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSBalance_StockValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBalance Stock Value; Stock Value; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | No |  |  |  |
| `WMSBalance_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBalance Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | No |  |  |  |
| `WMSBalance_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSBalance Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSBalance_CreatedAt` | Timestamp/date when the row was created. | WMSBalance Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSBalance_UpdatedAt` | Timestamp/date when the row was last changed. | WMSBalance Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_InventoryHolds`

Function: Control and review table for operational blocks, exceptions, approval decisions and human review workflows.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores active and released stock holds for customer, quality, damage, customs, bonded, trade compliance, finance, recall or system reasons.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user asks about blocks, exceptions, approvals, problems, disputes or review decisions. Preserve decision reason and user audit.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHold_ID` | Primary identifier for the wms inventory holds row. | WMSHold ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSHold_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSHold Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSHold_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSHold Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSHold_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSHold Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSHold_LotID` | Links this row to WMS_InventoryLots.WMSLot_ID. | WMSHold Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryLots.WMSLot_ID |  |  |
| `WMSHold_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSHold HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSHold_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSHold Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSHold_JobID` | Links this row to Job_Header.Job_ID. | WMSHold Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSHold_TypeCode` | Enum/lookup code selected from sys_WMSHoldTypes. | WMSHold Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSHoldTypes.WMSHoldType_Code | **ENUM** `sys_WMSHoldTypes`: `customer = Customer hold`, `quality = Quality hold`, `damage = Damage hold`, `customs = Customs hold`, `bonded = Bonded hold`, `trade_compliance = Trade compliance hold`, `finance = Finance/credit hold`, `recall = Recall hold`, `system = System hold` |  |
| `WMSHold_StatusCode` | Enum/lookup code selected from sys_WMSHoldStatuses. | WMSHold Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSHoldStatuses.WMSHoldStatus_Code | **ENUM** `sys_WMSHoldStatuses`: `open = Open`, `pending_release = Pending release`, `released = Released`, `cancelled = Cancelled` | `'open'::character varying` |
| `WMSHold_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSHold Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSHold_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSHold UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSHold_Reason` | WMSHold Reason field for wms inventory holds. | WMSHold Reason; Reason | `text` |  | Yes |  |  |  |
| `WMSHold_TCEHoldID` | Links this row to TCE_ComplianceHolds.TCEHold_ID. | WMSHold TCEHold ID; TCEHold ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> TCE_ComplianceHolds.TCEHold_ID |  |  |
| `WMSHold_TCEGateID` | Links this row to TCE_ReleaseGates.TCEGate_ID. | WMSHold TCEGate ID; TCEGate ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> TCE_ReleaseGates.TCEGate_ID |  |  |
| `WMSHold_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSHold Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSHold_PlacedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSHold Placed At; Placed At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSHold_PlacedBy` | Links this row to cmp_Users.User_ID. | WMSHold Placed By; Placed By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSHold_ReleasedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSHold Released At; Released At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSHold_ReleasedBy` | Links this row to cmp_Users.User_ID. | WMSHold Released By; Released By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSHold_ReleaseReason` | WMSHold Release Reason field for wms inventory holds. | WMSHold Release Reason; Release Reason | `text` |  | No |  |  |  |

### `WMS_InventoryLots`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores item lot/batch/expiry/origin/customs-status data for traceability and bonded stock control.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSLot_ID` | Primary identifier for the wms inventory lots row. | WMSLot ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSLot_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSLot Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSLot_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSLot Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Org_Master.Org_ID |  |  |
| `WMSLot_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSLot Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSLot_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSLot Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSLot_BatchNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSLot Batch Number; Batch Number; number; reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSLot_ManufactureDate` | Date/time used for workflow, validity, routing or external reporting. | WMSLot Manufacture Date; Manufacture Date | `date` | date | No |  |  |  |
| `WMSLot_ExpiryDate` | Date/time used for workflow, validity, routing or external reporting. | WMSLot Expiry Date; Expiry Date | `date` | date | No |  |  |  |
| `WMSLot_CountryOfOriginCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSLot Country Of Origin Code; Country Of Origin Code; code; lookup code; country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `WMSLot_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSLot Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSLot_BondedEntryLineID` | Numbering or ordering field used for display, document output or line sequencing. | WMSLot Bonded Entry Line ID; Bonded Entry Line ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSLot_AttributesJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSLot Attributes JSON; Attributes JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSLot_CreatedAt` | Timestamp/date when the row was created. | WMSLot Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_InventoryReservations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores reservation rows that reserve stock for outbound orders before physical allocation/picking.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSReservation_ID` | Primary identifier for the wms inventory reservations row. | WMSReservation ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSReservation_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSReservation Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSReservation_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSReservation Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSReservation_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSReservation Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSReservation_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSReservation Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSReservation_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSReservation Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSReservation_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReservation Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReservation_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSReservation UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSReservation_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSReservation Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'reserved'::character varying` |
| `WMSReservation_ReservedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSReservation Reserved At; Reserved At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSReservation_ReleasedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSReservation Released At; Released At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSReservation_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSReservation Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_InventorySerials`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores serial-numbered inventory items and their current location, handling unit and customs/inventory status.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSSerial_ID` | Primary identifier for the wms inventory serials row. | WMSSerial ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSSerial_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSSerial Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSSerial_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSSerial Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSSerial_LotID` | Links this row to WMS_InventoryLots.WMSLot_ID. | WMSSerial Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryLots.WMSLot_ID |  |  |
| `WMSSerial_SerialNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSSerial Serial Number; Serial Number; number; reference | `character varying(160)` | 160 chars | Yes | Unique group |  |  |
| `WMSSerial_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSSerial Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSSerial_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSSerial Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSSerial_CurrentLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSSerial Current Location ID; Current Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSSerial_CurrentHU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSSerial Current HU ID; Current HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSSerial_CreatedAt` | Timestamp/date when the row was created. | WMSSerial Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_InventoryTransactionLinks`

Function: Relationship bridge table that connects one business record to another without duplicating the master data.

Reason for existence: Exists to keep many-to-many or scoped relationships explicit, searchable and auditable instead of embedding repeated IDs or JSON arrays in the parent table.

Purpose: Links inventory transactions to related jobs, documents, customs records, EDI messages, workflow tasks or other business records.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user asks to connect, share, scope, map or associate two records. Confirm both endpoints before creating or deleting links.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTransLink_ID` | Primary identifier for the wms inventory transaction links row. | WMSTrans Link ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSTransLink_TransactionID` | Links this row to WMS_InventoryTransactions.WMSTransaction_ID. | WMSTrans Link Transaction ID; Transaction ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_InventoryTransactions.WMSTransaction_ID |  |  |
| `WMSTransLink_RecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSTrans Link Record Type Code; Record Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSTransLink_RecordID` | WMSTrans Link Record ID field for wms inventory transaction links. | WMSTrans Link Record ID; Record ID; id; UUID; record identifier | `uuid` | UUID | Yes |  |  |  |
| `WMSTransLink_LinkRoleCode` | Business role used to classify the row in the UI and validation rules. | WMSTrans Link Link Role Code; Link Role Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'source'::character varying` |
| `WMSTransLink_CreatedAt` | Timestamp/date when the row was created. | WMSTrans Link Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_InventoryTransactions`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists as the immutable stock movement ledger; inventory balances should be derived from controlled transaction posting.

Purpose: Immutable WMS inventory ledger. This is the source of truth for receipts, dispatches, moves, adjustments, bonded admissions and removals.

Primary UI/API use: Use backend posting services/functions for stock movements. Do not let ordinary UI forms edit posted ledger rows directly.

AI agent guidance: Use as audit/context for stock movement questions. For updates, call the WMS posting action rather than editing rows directly.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTransaction_ID` | Primary identifier for the wms inventory transactions row. | WMSTransaction ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSTransaction_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSTransaction Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSTransaction_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSTransaction Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSTransaction_TypeCode` | Enum/lookup code selected from sys_WMSTransactionTypes. | WMSTransaction Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSTransactionTypes.WMSTransactionType_Code | **ENUM** `sys_WMSTransactionTypes`: `receipt = Receipt`, `putaway = Putaway`, `move = Move`, `adjustment_in = Adjustment in`, `adjustment_out = Adjustment out`, `dispatch = Dispatch`, `destruction = Destruction`, `return = Return`, `status_change = Status change`, `bonded_admission = Bonded admission`, `bonded_removal = Bonded removal` |  |
| `WMSTransaction_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSTransaction Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSTransaction_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSTransaction Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSTransaction_FromLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSTransaction From Location ID; From Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSTransaction_ToLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSTransaction To Location ID; To Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSTransaction_LotID` | Links this row to WMS_InventoryLots.WMSLot_ID. | WMSTransaction Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryLots.WMSLot_ID |  |  |
| `WMSTransaction_SerialID` | Links this row to WMS_InventorySerials.WMSSerial_ID. | WMSTransaction Serial ID; Serial ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventorySerials.WMSSerial_ID |  |  |
| `WMSTransaction_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSTransaction HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSTransaction_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSTransaction Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  |  |
| `WMSTransaction_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTransaction UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSTransaction_BeforeOnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSTransaction Before On Hand Quantity; Before On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSTransaction_AfterOnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSTransaction After On Hand Quantity; After On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSTransaction_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSTransaction Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSTransaction_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSTransaction Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSTransaction_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSTransaction Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSTransaction_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSTransaction Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSTransaction_ReceiptID` | Links this row to WMS_Receipts.WMSReceipt_ID. | WMSTransaction Receipt ID; Receipt ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Receipts.WMSReceipt_ID |  |  |
| `WMSTransaction_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSTransaction Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSTransaction_JobID` | Links this row to Job_Header.Job_ID. | WMSTransaction Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSTransaction_SourceTable` | Name of the source/target database table linked to this row. | WMSTransaction Source Table; Source Table | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSTransaction_SourceID` | Identifier of the linked source/target record. | WMSTransaction Source ID; Source ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSTransaction_Reference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSTransaction Reference; Reference; external reference | `character varying(180)` | 180 chars | No |  |  |  |
| `WMSTransaction_Notes` | Free-text content entered by users or generated by the system. | WMSTransaction Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSTransaction_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSTransaction Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSTransaction_CreatedAt` | Timestamp/date when the row was created. | WMSTransaction Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSTransaction_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSTransaction Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_ItemBarcodes`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores item barcode aliases such as internal, customer, supplier, GTIN, EAN, UPC and package-level barcodes.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSItemBarcode_ID` | Primary identifier for the wms item barcodes row. | WMSItem Barcode ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSItemBarcode_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSItem Barcode Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSItemBarcode_Barcode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Barcode Barcode; Barcode; code; lookup code | `character varying(180)` | 180 chars | Yes | Unique group |  |  |
| `WMSItemBarcode_BarcodeTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Barcode Barcode Type Code; Barcode Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'internal'::character varying` |
| `WMSItemBarcode_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Barcode UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSItemBarcode_QuantityPerBarcode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Barcode Quantity Per Barcode; Quantity Per Barcode; code; lookup code; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `1` |
| `WMSItemBarcode_IsPrimary` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Barcode Is Primary; Is Primary | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemBarcode_IsActive` | Availability flag for new use in the application. | WMSItem Barcode Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSItemBarcode_CreatedAt` | Timestamp/date when the row was created. | WMSItem Barcode Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_ItemComplianceProfiles`

Function: Configuration table that defines behaviour, reusable rules, governed templates or versioned setup.

Reason for existence: Exists to let administrators change business behaviour by configuration rather than custom code, while keeping versions and approval history traceable.

Purpose: Stores jurisdiction-specific item compliance details such as HS, ECCN, licence need, SPS/excise flags and product-control linkage.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSItemComp_ID` | Primary identifier for the wms item compliance profiles row. | WMSItem Comp ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSItemComp_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSItem Comp Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSItemComp_JurisdictionCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Comp Jurisdiction Code; Jurisdiction Code; code; lookup code | `character varying(20)` | 20 chars | Yes | Unique group |  |  |
| `WMSItemComp_HSCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Comp HSCode; HSCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSItemComp_ECCNCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Comp ECCNCode; ECCNCode; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSItemComp_ControlTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Comp Control Type Code; Control Type Code; code; lookup code | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSItemComp_LicenseRequired` | WMSItem Comp License Required field for wms item compliance profiles. | WMSItem Comp License Required; License Required | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemComp_ImportRestriction` | WMSItem Comp Import Restriction field for wms item compliance profiles. | WMSItem Comp Import Restriction; Import Restriction | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemComp_ExportRestriction` | WMSItem Comp Export Restriction field for wms item compliance profiles. | WMSItem Comp Export Restriction; Export Restriction | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemComp_ExciseRelevant` | WMSItem Comp Excise Relevant field for wms item compliance profiles. | WMSItem Comp Excise Relevant; Excise Relevant | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemComp_SPSRelevant` | WMSItem Comp SPSRelevant field for wms item compliance profiles. | WMSItem Comp SPSRelevant; SPSRelevant | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemComp_TCEProductControlRuleID` | WMSItem Comp TCEProduct Control Rule ID field for wms item compliance profiles. | WMSItem Comp TCEProduct Control Rule ID; TCEProduct Control Rule ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSItemComp_Notes` | Free-text content entered by users or generated by the system. | WMSItem Comp Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSItemComp_IsActive` | Availability flag for new use in the application. | WMSItem Comp Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSItemComp_CreatedAt` | Timestamp/date when the row was created. | WMSItem Comp Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_ItemUOMs`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores item unit-of-measure conversions and packaging dimensions used for receiving, stock, fulfilment and rating.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSItemUOM_ID` | Primary identifier for the wms item uoms row. | WMSItem UOM ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSItemUOM_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSItem UOM Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSItemUOM_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem UOM UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes | Unique group |  |  |
| `WMSItemUOM_QuantityInBaseUOM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem UOM Quantity In Base UOM; Quantity In Base UOM; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `1` |
| `WMSItemUOM_LengthM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem UOM Length M; Length M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItemUOM_WidthM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem UOM Width M; Width M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItemUOM_HeightM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem UOM Height M; Height M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItemUOM_GrossWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSItem UOM Gross Weight KG; Gross Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItemUOM_IsPurchasingUOM` | WMSItem UOM Is Purchasing UOM field for wms item uoms. | WMSItem UOM Is Purchasing UOM; Is Purchasing UOM | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemUOM_IsStockingUOM` | WMSItem UOM Is Stocking UOM field for wms item uoms. | WMSItem UOM Is Stocking UOM; Is Stocking UOM | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItemUOM_IsSellingUOM` | WMSItem UOM Is Selling UOM field for wms item uoms. | WMSItem UOM Is Selling UOM; Is Selling UOM | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_Items`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores WMS item/SKU master data including HS/ECCN, origin, dimensions, weight, serial/lot/expiry rules, bonded eligibility and compliance flags.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSItem_ID` | Primary identifier for the wms items row. | WMSItem ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSItem_LegacySKUID` | Links this row to WarehouseSKU.Id. | WMSItem Legacy SKUID; Legacy SKUID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseSKU.Id |  |  |
| `WMSItem_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSItem Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> Org_Master.Org_ID |  |  |
| `WMSItem_DefaultFacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSItem Default Facility ID; Default Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSItem_SKU` | WMSItem SKU field for wms items. | WMSItem SKU; SKU | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSItem_Description` | Description shown in forms, grids or support screens. | WMSItem Description; Description; details | `character varying(300)` | 300 chars | Yes |  |  |  |
| `WMSItem_CommodityDescription` | Description shown in forms, grids or support screens. | WMSItem Commodity Description; Commodity Description; description; details | `text` |  | No |  |  |  |
| `WMSItem_HSCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem HSCode; HSCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSItem_ECCNCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem ECCNCode; ECCNCode; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSItem_CountryOfOriginCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Country Of Origin Code; Country Of Origin Code; code; lookup code; country; nation | `character varying(2)` | 2 chars | No |  |  |  |
| `WMSItem_BaseUOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSItem Base UOMCode; Base UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSItem_LengthM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem Length M; Length M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItem_WidthM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem Width M; Width M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItem_HeightM` | Cargo measurement used for operational, rating, customs or document output. | WMSItem Height M; Height M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItem_NetWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSItem Net Weight KG; Net Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItem_GrossWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSItem Gross Weight KG; Gross Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSItem_IsDangerousGoods` | WMSItem Is Dangerous Goods field for wms items. | WMSItem Is Dangerous Goods; Is Dangerous Goods | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_IsExciseGoods` | WMSItem Is Excise Goods field for wms items. | WMSItem Is Excise Goods; Is Excise Goods | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_IsHighValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSItem Is High Value; Is High Value; amount; value; total | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_IsBondedEligible` | WMSItem Is Bonded Eligible field for wms items. | WMSItem Is Bonded Eligible; Is Bonded Eligible | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_RequiresLot` | WMSItem Requires Lot field for wms items. | WMSItem Requires Lot; Requires Lot | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_RequiresSerial` | Numbering or ordering field used for display, document output or line sequencing. | WMSItem Requires Serial; Requires Serial | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_RequiresExpiry` | WMSItem Requires Expiry field for wms items. | WMSItem Requires Expiry; Requires Expiry | `boolean` | true/false | Yes |  |  | `false` |
| `WMSItem_TemperatureMinC` | WMSItem Temperature Min C field for wms items. | WMSItem Temperature Min C; Temperature Min C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSItem_TemperatureMaxC` | WMSItem Temperature Max C field for wms items. | WMSItem Temperature Max C; Temperature Max C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSItem_ComplianceJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSItem Compliance JSON; Compliance JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSItem_IsActive` | Availability flag for new use in the application. | WMSItem Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSItem_CreatedAt` | Timestamp/date when the row was created. | WMSItem Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSItem_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSItem Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSItem_UpdatedAt` | Timestamp/date when the row was last changed. | WMSItem Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSItem_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSItem Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_KPIResults`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores WMS KPI snapshots by facility, office, customer and period.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSKPI_ID` | Primary identifier for the wms kpiresults row. | WMSKPI ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSKPI_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSKPI Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSKPI_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSKPI Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Offices.Office_ID |  |  |
| `WMSKPI_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSKPI Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSKPI_PeriodStartDate` | Date/time used for workflow, validity, routing or external reporting. | WMSKPI Period Start Date; Period Start Date | `date` | date | Yes |  |  |  |
| `WMSKPI_PeriodEndDate` | Date/time used for workflow, validity, routing or external reporting. | WMSKPI Period End Date; Period End Date | `date` | date | Yes |  |  |  |
| `WMSKPI_MetricCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSKPI Metric Code; Metric Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSKPI_MetricName` | Human-readable name or title displayed to users. | WMSKPI Metric Name; Metric Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSKPI_MetricValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSKPI Metric Value; Metric Value; amount; value; total | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSKPI_TargetValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSKPI Target Value; Target Value; amount; value; total | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSKPI_UnitCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSKPI Unit Code; Unit Code; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSKPI_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSKPI Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSKPI_DetailsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSKPI Details JSON; Details JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSKPI_CreatedAt` | Timestamp/date when the row was created. | WMSKPI Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Locations`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores bin, rack, dock, staging, yard and virtual locations with capacity, barcode, status and customs/bonded rules.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSLocation_ID` | Primary identifier for the wms locations row. | WMSLocation ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSLocation_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSLocation Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSLocation_ZoneID` | Links this row to WMS_Zones.WMSZone_ID. | WMSLocation Zone ID; Zone ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Zones.WMSZone_ID |  |  |
| `WMSLocation_LegacyLocationID` | Links this row to WarehouseLocations.Id. | WMSLocation Legacy Location ID; Legacy Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseLocations.Id |  |  |
| `WMSLocation_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Code; Code; lookup code | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSLocation_Barcode` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Barcode; Barcode; code; lookup code | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSLocation_TypeCode` | Enum/lookup code selected from sys_WMSLocationTypes. | WMSLocation Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSLocationTypes.WMSLocationType_Code | **ENUM** `sys_WMSLocationTypes`: `bin = Bin`, `rack = Rack`, `floor = Floor`, `dock = Dock`, `staging = Staging`, `yard_slot = Yard slot`, `inspection = Inspection`, `virtual = Virtual` |  |
| `WMSLocation_StatusCode` | Enum/lookup code selected from sys_WMSLocationStatuses. | WMSLocation Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSLocationStatuses.WMSLocationStatus_Code | **ENUM** `sys_WMSLocationStatuses`: `available = Available`, `occupied = Occupied`, `full = Full`, `blocked = Blocked`, `maintenance = Maintenance`, `customs_locked = Customs locked`, `inactive = Inactive` | `'available'::character varying` |
| `WMSLocation_Aisle` | WMSLocation Aisle field for wms locations. | WMSLocation Aisle; Aisle | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSLocation_Bay` | WMSLocation Bay field for wms locations. | WMSLocation Bay; Bay | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSLocation_Level` | WMSLocation Level field for wms locations. | WMSLocation Level; Level | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSLocation_Position` | WMSLocation Position field for wms locations. | WMSLocation Position; Position | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSLocation_LengthM` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Length M; Length M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSLocation_WidthM` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Width M; Width M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSLocation_HeightM` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Height M; Height M | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSLocation_MaxWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Max Weight KG; Max Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSLocation_MaxVolumeCBM` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Max Volume CBM; Max Volume CBM; volume; cube; CBM | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSLocation_TemperatureMinC` | WMSLocation Temperature Min C field for wms locations. | WMSLocation Temperature Min C; Temperature Min C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSLocation_TemperatureMaxC` | WMSLocation Temperature Max C field for wms locations. | WMSLocation Temperature Max C; Temperature Max C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSLocation_AllowsMultiSKU` | WMSLocation Allows Multi SKU field for wms locations. | WMSLocation Allows Multi SKU; Allows Multi SKU | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocation_AllowsBondedStock` | WMSLocation Allows Bonded Stock field for wms locations. | WMSLocation Allows Bonded Stock; Allows Bonded Stock | `boolean` | true/false | Yes |  |  | `false` |
| `WMSLocation_AllowedCustomsStatusesJSON` | Lifecycle status for workflow, badges and filtering. | WMSLocation Allowed Customs Statuses JSON; Allowed Customs Statuses JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSLocation_IsActive` | Availability flag for new use in the application. | WMSLocation Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocation_CreatedAt` | Timestamp/date when the row was created. | WMSLocation Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSLocation_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSLocation Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSLocation_UpdatedAt` | Timestamp/date when the row was last changed. | WMSLocation Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSLocation_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSLocation Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_OrderLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores warehouse order line detail including expected/received/allocated/picked/packed/dispatched quantities and customs status.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderLine_ID` | Primary identifier for the wms order lines row. | WMSOrder Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSOrderLine_LegacyWarehouseOrderItemID` | Links this row to WarehouseOrderItems.Id. | WMSOrder Line Legacy Warehouse Order Item ID; Legacy Warehouse Order Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseOrderItems.Id |  |  |
| `WMSOrderLine_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSOrder Line Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSOrderLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSOrderLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSOrder Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSOrderLine_SourceJobCargoID` | Identifier of the linked source/target record. | WMSOrder Line Source Job Cargo ID; Source Job Cargo ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSOrderLine_SourceJobEquipmentID` | Identifier of the linked source/target record. | WMSOrder Line Source Job Equipment ID; Source Job Equipment ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSOrderLine_StatusCode` | Enum/lookup code selected from sys_WMSOrderLineStatuses. | WMSOrder Line Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSOrderLineStatuses.WMSOrderLineStatus_Code | **ENUM** `sys_WMSOrderLineStatuses`: `open = Open`, `allocated = Allocated`, `picked = Picked`, `received = Received`, `packed = Packed`, `dispatched = Dispatched`, `short = Short`, `cancelled = Cancelled` | `'open'::character varying` |
| `WMSOrderLine_OrderedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Ordered Quantity; Ordered Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_ReceivedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Received Quantity; Received Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_AllocatedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Allocated Quantity; Allocated Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_PickedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Picked Quantity; Picked Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_PackedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Packed Quantity; Packed Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_DispatchedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSOrder Line Dispatched Quantity; Dispatched Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSOrderLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSOrderLine_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Line Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSOrderLine_SerialNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Line Serial Number; Serial Number; number; reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSOrderLine_ExpiryDate` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Line Expiry Date; Expiry Date | `date` | date | No |  |  |  |
| `WMSOrderLine_SourceLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSOrder Line Source Location ID; Source Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSOrderLine_TargetLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSOrder Line Target Location ID; Target Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSOrderLine_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSOrder Line Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` | `'available'::character varying` |
| `WMSOrderLine_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSOrder Line Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSOrderLine_GoodsValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSOrder Line Goods Value; Goods Value; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp | No |  |  |  |
| `WMSOrderLine_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Line Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | No |  |  |  |
| `WMSOrderLine_Instructions` | Free-text content entered by users or generated by the system. | WMSOrder Line Instructions; Instructions | `text` |  | No |  |  |  |
| `WMSOrderLine_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSOrder Line Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSOrderLine_CreatedAt` | Timestamp/date when the row was created. | WMSOrder Line Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_OrderParties`

Function: Relationship bridge table that connects one business record to another without duplicating the master data.

Reason for existence: Exists to keep many-to-many or scoped relationships explicit, searchable and auditable instead of embedding repeated IDs or JSON arrays in the parent table.

Purpose: Stores parties on a warehouse order such as customer, supplier, carrier, consignee, depositor, importer, driver or agent.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderParty_ID` | Primary identifier for the wms order parties row. | WMSOrder Party ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSOrderParty_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSOrder Party Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSOrderParty_RoleCode` | Business role used to classify the row in the UI and validation rules. | WMSOrder Party Role Code; Role Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSOrderParty_OrgID` | Links this row to Org_Master.Org_ID. | WMSOrder Party Org ID; Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSOrderParty_ContactName` | Human-readable name or title displayed to users. | WMSOrder Party Contact Name; Contact Name | `character varying(180)` | 180 chars | No |  |  |  |
| `WMSOrderParty_Email` | Email address or email contact field. | WMSOrder Party Email; Email | `character varying(254)` | 254 chars | No |  |  |  |
| `WMSOrderParty_Phone` | Telephone/contact number field. | WMSOrder Party Phone; Phone | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSOrderParty_NameSnapshot` | Point-in-time snapshot used for legal, audit or submission stability. | WMSOrder Party Name Snapshot; Name Snapshot | `character varying(240)` | 240 chars | No |  |  |  |
| `WMSOrderParty_AddressSnapshot` | Point-in-time snapshot used for legal, audit or submission stability. | WMSOrder Party Address Snapshot; Address Snapshot; location; place | `text` |  | No |  |  |  |
| `WMSOrderParty_IsPrimary` | WMSOrder Party Is Primary field for wms order parties. | WMSOrder Party Is Primary; Is Primary | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrderParty_CreatedAt` | Timestamp/date when the row was created. | WMSOrder Party Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_OrderReferences`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores customer, carrier, customs, job, EDI and external references attached to a warehouse order.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderRef_ID` | Primary identifier for the wms order references row. | WMSOrder Ref ID; ID; reference; external reference; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSOrderRef_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSOrder Ref Order ID; Order ID; reference; external reference; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSOrderRef_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Ref Type Code; Type Code; code; lookup code; reference; external reference | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSOrderRef_Value` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSOrder Ref Value; Value; amount; total; reference; external reference | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSOrderRef_SourceSystem` | WMSOrder Ref Source System field for wms order references. | WMSOrder Ref Source System; Source System; reference; external reference | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSOrderRef_IsPrimary` | WMSOrder Ref Is Primary field for wms order references. | WMSOrder Ref Is Primary; Is Primary; reference; external reference | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrderRef_CreatedAt` | Timestamp/date when the row was created. | WMSOrder Ref Created At; Created At; reference; external reference; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Orders`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to connect warehouse inbound/outbound/internal work to jobs, customers, facilities and operational status without turning the job table into a WMS table.

Purpose: Stores warehouse inbound, outbound, transfer, return, cross-dock, bonded, inspection, adjustment and value-added service orders. Orders can link directly to Job_Header and deeper job cargo/equipment through record links.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user refers to warehouse work tied to a shipment, inbound/outbound order, receipt, dispatch, fulfilment or bonded warehouse activity.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrder_ID` | Primary identifier for the wms orders row. | WMSOrder ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSOrder_LegacyWarehouseOrderID` | Links this row to WarehouseOrders.Id. | WMSOrder Legacy Warehouse Order ID; Legacy Warehouse Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseOrders.Id |  |  |
| `WMSOrder_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSOrder Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSOrder_OrgOfficeID` | Links this row to cmp_Offices.Office_ID. | WMSOrder Org Office ID; Org Office ID; office; branch; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Offices.Office_ID |  |  |
| `WMSOrder_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSOrder Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> Org_Master.Org_ID |  |  |
| `WMSOrder_JobID` | Links this row to Job_Header.Job_ID. | WMSOrder Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSOrder_SourceJobLegID` | Identifier of the linked source/target record. | WMSOrder Source Job Leg ID; Source Job Leg ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSOrder_SourceJobCargoID` | Identifier of the linked source/target record. | WMSOrder Source Job Cargo ID; Source Job Cargo ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSOrder_SourceJobEquipmentID` | Identifier of the linked source/target record. | WMSOrder Source Job Equipment ID; Source Job Equipment ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSOrder_TypeCode` | Enum/lookup code selected from sys_WMSOrderTypes. | WMSOrder Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSOrderTypes.WMSOrderType_Code | **ENUM** `sys_WMSOrderTypes`: `inbound = Inbound receipt`, `outbound = Outbound release`, `transfer = Internal transfer`, `return = Return`, `crossdock = Cross-dock`, `adjustment = Stock adjustment`, `cycle_count = Cycle count`, `value_added_service = Value-added service`, `bonded_admission = Bonded admission`, `bonded_removal = Bonded removal`, `temporary_removal = Temporary removal`, `destruction = Destruction` |  |
| `WMSOrder_StatusCode` | Enum/lookup code selected from sys_WMSOrderStatuses. | WMSOrder Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSOrderStatuses.WMSOrderStatus_Code | **ENUM** `sys_WMSOrderStatuses`: `draft = Draft`, `booked = Booked`, `planned = Planned`, `in_progress = In progress`, `part_complete = Part complete`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` | `'draft'::character varying` |
| `WMSOrder_PriorityCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Priority Code; Priority Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'normal'::character varying` |
| `WMSOrder_CustomerReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSOrder Customer Reference; Customer Reference; customer; client; reference; external reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSOrder_SupplierReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSOrder Supplier Reference; Supplier Reference; supplier; vendor; reference; external reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSOrder_CarrierReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSOrder Carrier Reference; Carrier Reference; carrier; shipping line; airline; haulier; reference; external reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSOrder_EDIMessageID` | Links this row to EDI_Messages.EDIMessage_ID. | WMSOrder EDIMessage ID; EDIMessage ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> EDI_Messages.EDIMessage_ID |  |  |
| `WMSOrder_InboundFromOrgID` | Links this row to Org_Master.Org_ID. | WMSOrder Inbound From Org ID; Inbound From Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSOrder_OutboundToOrgID` | Links this row to Org_Master.Org_ID. | WMSOrder Outbound To Org ID; Outbound To Org ID; organisation; company; party; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSOrder_CarrierOrgID` | Links this row to Org_Master.Org_ID. | WMSOrder Carrier Org ID; Carrier Org ID; organisation; company; party; carrier; shipping line; airline; haulier; id | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSOrder_RequestedDate` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Requested Date; Requested Date | `date` | date | No |  |  |  |
| `WMSOrder_AppointmentStartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Appointment Start At; Appointment Start At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSOrder_AppointmentEndAt` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Appointment End At; Appointment End At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSOrder_TransportModeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Transport Mode Code; Transport Mode Code; code; lookup code | `character varying(40)` | 40 chars | No |  |  |  |
| `WMSOrder_VehicleReg` | WMSOrder Vehicle Reg field for wms orders. | WMSOrder Vehicle Reg; Vehicle Reg | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSOrder_ContainerNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Container Number; Container Number; number; reference | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSOrder_SealNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Seal Number; Seal Number; number; reference | `character varying(80)` | 80 chars | No |  |  |  |
| `WMSOrder_RequiresCustomsRelease` | WMSOrder Requires Customs Release field for wms orders. | WMSOrder Requires Customs Release; Requires Customs Release | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrder_RequiresComplianceRelease` | WMSOrder Requires Compliance Release field for wms orders. | WMSOrder Requires Compliance Release; Requires Compliance Release | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrder_RequiresFinanceRelease` | WMSOrder Requires Finance Release field for wms orders. | WMSOrder Requires Finance Release; Requires Finance Release | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrder_ReleaseGateStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSOrder Release Gate Status Code; Release Gate Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'not_checked'::character varying` |
| `WMSOrder_Instructions` | Free-text content entered by users or generated by the system. | WMSOrder Instructions; Instructions | `text` |  | No |  |  |  |
| `WMSOrder_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSOrder Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSOrder_CreatedAt` | Timestamp/date when the row was created. | WMSOrder Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSOrder_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSOrder Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSOrder_UpdatedAt` | Timestamp/date when the row was last changed. | WMSOrder Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSOrder_UpdatedBy` | Links this row to cmp_Users.User_ID. | WMSOrder Updated By; Updated By; updated date; modified date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSOrder_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSOrder Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `WMS_PackTasks`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores pack task execution details against outbound orders and handling units.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSPack_ID` | Primary identifier for the wms pack tasks row. | WMSPack ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSPack_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSPack Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSPack_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSPack Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSPack_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSPack HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSPack_StatusCode` | Enum/lookup code selected from sys_WMSTaskStatuses. | WMSPack Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WMSTaskStatuses`: `queued = Queued`, `assigned = Assigned`, `in_progress = In progress`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` | `'queued'::character varying` |
| `WMSPack_PackedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSPack Packed At; Packed At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSPack_PackedBy` | Links this row to cmp_Users.User_ID. | WMSPack Packed By; Packed By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSPack_Notes` | Free-text content entered by users or generated by the system. | WMSPack Notes; Notes; comments | `text` |  | No |  |  |  |

### `WMS_Packages`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores outbound packages, tracking numbers, labels and physical measurements.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSPackage_ID` | Primary identifier for the wms packages row. | WMSPackage ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSPackage_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSPackage Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSPackage_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSPackage HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSPackage_PackageNumber` | Cargo measurement used for operational, rating, customs or document output. | WMSPackage Package Number; Package Number; number; reference | `character varying(120)` | 120 chars | Yes | Unique group |  |  |
| `WMSPackage_TrackingNumber` | Cargo measurement used for operational, rating, customs or document output. | WMSPackage Tracking Number; Tracking Number; number; reference | `character varying(160)` | 160 chars | No |  |  |  |
| `WMSPackage_CarrierOrgID` | Links this row to Org_Master.Org_ID. | WMSPackage Carrier Org ID; Carrier Org ID; organisation; company; party; carrier; shipping line; airline; haulier; id | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSPackage_GrossWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSPackage Gross Weight KG; Gross Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSPackage_VolumeCBM` | Cargo measurement used for operational, rating, customs or document output. | WMSPackage Volume CBM; Volume CBM; volume; cube; CBM | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSPackage_LabelDocumentID` | Human-readable name or title displayed to users. | WMSPackage Label Document ID; Label Document ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSPackage_CreatedAt` | Timestamp/date when the row was created. | WMSPackage Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_PhotoEvidence`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse photo evidence metadata linked to WMS records and jobs.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSPhoto_ID` | Primary identifier for the wms photo evidence row. | WMSPhoto ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSPhoto_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSPhoto Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSPhoto_RecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSPhoto Record Type Code; Record Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSPhoto_RecordID` | WMSPhoto Record ID field for wms photo evidence. | WMSPhoto Record ID; Record ID; id; UUID; record identifier | `uuid` | UUID | Yes |  |  |  |
| `WMSPhoto_JobID` | Links this row to Job_Header.Job_ID. | WMSPhoto Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSPhoto_FileRef` | WMSPhoto File Ref field for wms photo evidence. | WMSPhoto File Ref; File Ref; reference; external reference | `text` |  | Yes |  |  |  |
| `WMSPhoto_FileHash` | Hash used to detect duplicate/changed content or support retrieval integrity. | WMSPhoto File Hash; File Hash | `character varying(128)` | 128 chars | No |  |  |  |
| `WMSPhoto_Caption` | WMSPhoto Caption field for wms photo evidence. | WMSPhoto Caption; Caption | `text` |  | No |  |  |  |
| `WMSPhoto_Sensitive` | WMSPhoto Sensitive field for wms photo evidence. | WMSPhoto Sensitive; Sensitive | `boolean` | true/false | Yes |  |  | `false` |
| `WMSPhoto_CapturedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSPhoto Captured At; Captured At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSPhoto_CapturedBy` | Links this row to cmp_Users.User_ID. | WMSPhoto Captured By; Captured By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_PickTasks`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores pick task execution details against order lines and inventory balances.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSPick_ID` | Primary identifier for the wms pick tasks row. | WMSPick ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSPick_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSPick Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSPick_WaveID` | Links this row to WMS_Waves.WMSWave_ID. | WMSPick Wave ID; Wave ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Waves.WMSWave_ID |  |  |
| `WMSPick_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSPick Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSPick_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSPick Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSPick_SourceLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSPick Source Location ID; Source Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSPick_TargetLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSPick Target Location ID; Target Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSPick_QuantityToPick` | Cargo measurement used for operational, rating, customs or document output. | WMSPick Quantity To Pick; Quantity To Pick; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSPick_QuantityPicked` | Cargo measurement used for operational, rating, customs or document output. | WMSPick Quantity Picked; Quantity Picked; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSPick_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSPick UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSPick_StatusCode` | Enum/lookup code selected from sys_WMSTaskStatuses. | WMSPick Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WMSTaskStatuses`: `queued = Queued`, `assigned = Assigned`, `in_progress = In progress`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` | `'queued'::character varying` |
| `WMSPick_PickedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSPick Picked At; Picked At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSPick_PickedBy` | Links this row to cmp_Users.User_ID. | WMSPick Picked By; Picked By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_ReceiptDiscrepancies`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores inbound discrepancies such as over, short, damage, wrong item, temperature breach, customs issue or missing documents.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSReceiptDisc_ID` | Primary identifier for the wms receipt discrepancies row. | WMSReceipt Disc ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSReceiptDisc_ReceiptID` | Links this row to WMS_Receipts.WMSReceipt_ID. | WMSReceipt Disc Receipt ID; Receipt ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Receipts.WMSReceipt_ID |  |  |
| `WMSReceiptDisc_ReceiptLineID` | Links this row to WMS_ReceiptLines.WMSReceiptLine_ID. | WMSReceipt Disc Receipt Line ID; Receipt Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_ReceiptLines.WMSReceiptLine_ID |  |  |
| `WMSReceiptDisc_ExceptionTypeCode` | Enum/lookup code selected from sys_WMSExceptionTypes. | WMSReceipt Disc Exception Type Code; Exception Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSExceptionTypes.WMSExceptionType_Code | **ENUM** `sys_WMSExceptionTypes`: `over = Over receipt`, `short = Short receipt`, `damage = Damage`, `wrong_item = Wrong item`, `wrong_location = Wrong location`, `temperature_breach = Temperature breach`, `customs_issue = Customs issue`, `compliance_issue = Compliance issue`, `credit_hold = Credit hold`, `system_error = System error` |  |
| `WMSReceiptDisc_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSReceipt Disc Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'open'::character varying` |
| `WMSReceiptDisc_ExpectedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Disc Expected Quantity; Expected Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSReceiptDisc_ActualQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Disc Actual Quantity; Actual Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSReceiptDisc_Description` | Description shown in forms, grids or support screens. | WMSReceipt Disc Description; Description; details | `text` |  | Yes |  |  |  |
| `WMSReceiptDisc_PhotoEvidenceJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSReceipt Disc Photo Evidence JSON; Photo Evidence JSON | `jsonb` | JSON | Yes |  |  | `'[]'::jsonb` |
| `WMSReceiptDisc_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSReceipt Disc Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSReceiptDisc_CreatedAt` | Timestamp/date when the row was created. | WMSReceipt Disc Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSReceiptDisc_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSReceipt Disc Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_ReceiptLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores receipt line quantities, damage/over/short values, target locations and posted inventory transaction links.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSReceiptLine_ID` | Primary identifier for the wms receipt lines row. | WMSReceipt Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSReceiptLine_ReceiptID` | Links this row to WMS_Receipts.WMSReceipt_ID. | WMSReceipt Line Receipt ID; Receipt ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Receipts.WMSReceipt_ID |  |  |
| `WMSReceiptLine_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSReceipt Line Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSReceiptLine_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSReceipt Line Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSReceiptLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSReceipt Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSReceiptLine_ExpectedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Line Expected Quantity; Expected Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReceiptLine_ReceivedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Line Received Quantity; Received Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReceiptLine_DamagedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Line Damaged Quantity; Damaged Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReceiptLine_OverQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Line Over Quantity; Over Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReceiptLine_ShortQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSReceipt Line Short Quantity; Short Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSReceiptLine_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSReceipt Line UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | Yes |  |  | `'EA'::character varying` |
| `WMSReceiptLine_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSReceipt Line Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSReceiptLine_ExpiryDate` | Date/time used for workflow, validity, routing or external reporting. | WMSReceipt Line Expiry Date; Expiry Date | `date` | date | No |  |  |  |
| `WMSReceiptLine_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSReceipt Line HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSReceiptLine_TargetLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSReceipt Line Target Location ID; Target Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSReceiptLine_InventoryTransactionID` | Links this row to WMS_InventoryTransactions.WMSTransaction_ID. | WMSReceipt Line Inventory Transaction ID; Inventory Transaction ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryTransactions.WMSTransaction_ID |  |  |
| `WMSReceiptLine_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSReceipt Line Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` | `'free_circulation'::character varying` |
| `WMSReceiptLine_CreatedAt` | Timestamp/date when the row was created. | WMSReceipt Line Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |

### `WMS_Receipts`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores goods-received note headers linked to orders, jobs, advice records, docks and receiving locations.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSReceipt_ID` | Primary identifier for the wms receipts row. | WMSReceipt ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSReceipt_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSReceipt Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSReceipt_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSReceipt Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSReceipt_AdviceID` | Links this row to WMS_InboundAdvices.WMSAdvice_ID. | WMSReceipt Advice ID; Advice ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InboundAdvices.WMSAdvice_ID |  |  |
| `WMSReceipt_JobID` | Links this row to Job_Header.Job_ID. | WMSReceipt Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSReceipt_ReceiptNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSReceipt Receipt Number; Receipt Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSReceipt_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSReceipt Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'in_progress'::character varying` |
| `WMSReceipt_DockID` | Links this row to WMS_Docks.WMSDock_ID. | WMSReceipt Dock ID; Dock ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Docks.WMSDock_ID |  |  |
| `WMSReceipt_ReceivingLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSReceipt Receiving Location ID; Receiving Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSReceipt_ReceivedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSReceipt Received At; Received At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSReceipt_ReceivedBy` | Links this row to cmp_Users.User_ID. | WMSReceipt Received By; Received By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSReceipt_HasDiscrepancy` | WMSReceipt Has Discrepancy field for wms receipts. | WMSReceipt Has Discrepancy; Has Discrepancy | `boolean` | true/false | Yes |  |  | `false` |
| `WMSReceipt_Notes` | Free-text content entered by users or generated by the system. | WMSReceipt Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSReceipt_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSReceipt Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSReceipt_CreatedAt` | Timestamp/date when the row was created. | WMSReceipt Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSReceipt_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSReceipt Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_RecordLinks`

Function: Relationship bridge table that connects one business record to another without duplicating the master data.

Reason for existence: Exists to keep many-to-many or scoped relationships explicit, searchable and auditable instead of embedding repeated IDs or JSON arrays in the parent table.

Purpose: Generic WMS record-link table for linking WMS records to jobs, job cargo, job equipment, customs, EDI, documents, workflow, finance and portal records without duplicating data.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use when the user asks to connect, share, scope, map or associate two records. Confirm both endpoints before creating or deleting links.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSRecordLink_ID` | Primary identifier for the wms record links row. | WMSRecord Link ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSRecordLink_WMSRecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSRecord Link WMSRecord Type Code; WMSRecord Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSRecordLink_WMSRecordID` | WMSRecord Link WMSRecord ID field for wms record links. | WMSRecord Link WMSRecord ID; WMSRecord ID; id; UUID; record identifier | `uuid` | UUID | Yes |  |  |  |
| `WMSRecordLink_TargetRecordTypeCode` | Enum/lookup code selected from sys_WorkflowRecordTypes. | WMSRecord Link Target Record Type Code; Target Record Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  | **ENUM** `sys_WorkflowRecordTypes`: `job = Job`, `quote = Quote`, `bl = Bill of lading`, `awb = Air waybill`, `customs = Customs declaration`, `cds = UK CDS declaration`, `t1 = T1 declaration`, `document = Document`, `document_render = Document render`, `document_security = Document security`, `warehouse_order = Warehouse order`, `accounting_batch = Accounting batch` |  |
| `WMSRecordLink_TargetRecordID` | Identifier of the linked source/target record. | WMSRecord Link Target Record ID; Target Record ID; id; UUID; record identifier | `uuid` | UUID | Yes |  |  |  |
| `WMSRecordLink_LinkRoleCode` | Business role used to classify the row in the UI and validation rules. | WMSRecord Link Link Role Code; Link Role Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  | `'related'::character varying` |
| `WMSRecordLink_IsPrimary` | WMSRecord Link Is Primary field for wms record links. | WMSRecord Link Is Primary; Is Primary | `boolean` | true/false | Yes |  |  | `false` |
| `WMSRecordLink_CreatedAt` | Timestamp/date when the row was created. | WMSRecord Link Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSRecordLink_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSRecord Link Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_ScanEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Stores barcode/QR/location/item/handling-unit scans with expected/scanned values and mismatch flags.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSScanEvent_ID` | Primary identifier for the wms scan events row. | WMSScan Event ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSScanEvent_SessionID` | Links this row to WMS_ScanSessions.WMSScanSession_ID. | WMSScan Event Session ID; Session ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_ScanSessions.WMSScanSession_ID |  |  |
| `WMSScanEvent_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSScan Event Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSScanEvent_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSScan Event Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSScanEvent_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSScan Event Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSScanEvent_EventTypeCode` | Enum/lookup code selected from sys_WMSScanEventTypes. | WMSScan Event Event Type Code; Event Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSScanEventTypes.WMSScanEventType_Code | **ENUM** `sys_WMSScanEventTypes`: `location_scan = Location scan`, `item_scan = Item scan`, `handling_unit_scan = Handling unit scan`, `serial_scan = Serial scan`, `seal_scan = Seal scan`, `mismatch = Mismatch`, `exception = Exception`, `photo = Photo` |  |
| `WMSScanEvent_BarcodeValue` | Code value used for lookup, external schema mapping or integration payloads. | WMSScan Event Barcode Value; Barcode Value; amount; value; total | `character varying(240)` | 240 chars | Yes |  |  |  |
| `WMSScanEvent_ExpectedValue` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSScan Event Expected Value; Expected Value; amount; value; total | `character varying(240)` | 240 chars | No |  |  |  |
| `WMSScanEvent_IsMatch` | WMSScan Event Is Match field for wms scan events. | WMSScan Event Is Match; Is Match | `boolean` | true/false | Yes |  |  | `true` |
| `WMSScanEvent_LocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSScan Event Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSScanEvent_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSScan Event Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSScanEvent_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSScan Event HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSScanEvent_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSScan Event Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSScanEvent_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSScan Event UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSScanEvent_ScannedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSScan Event Scanned At; Scanned At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSScanEvent_ScannedBy` | Links this row to cmp_Users.User_ID. | WMSScan Event Scanned By; Scanned By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSScanEvent_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSScan Event Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |

### `WMS_ScanSessions`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores mobile scan sessions by user/device/task.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSScanSession_ID` | Primary identifier for the wms scan sessions row. | WMSScan Session ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSScanSession_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSScan Session Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSScanSession_UserID` | Links this row to cmp_Users.User_ID. | WMSScan Session User ID; User ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSScanSession_DeviceID` | WMSScan Session Device ID field for wms scan sessions. | WMSScan Session Device ID; Device ID; id; UUID; record identifier | `character varying(120)` | 120 chars | No |  |  |  |
| `WMSScanSession_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSScan Session Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSScanSession_StartedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSScan Session Started At; Started At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSScanSession_EndedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSScan Session Ended At; Ended At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSScanSession_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSScan Session Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |

### `WMS_ServiceContractLines`

Function: Detail-line table for grids, repeating rows, financial/cargo lines or child records under a parent transaction.

Reason for existence: Exists because the parent record can have multiple repeatable details that need their own quantities, values, statuses, audit history or external mappings.

Purpose: Stores chargeable warehouse service lines such as receipt, storage, pick/pack, dispatch, labelling and bonded administration.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSContractLine_ID` | Primary identifier for the wms service contract lines row. | WMSContract Line ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSContractLine_ContractID` | Links this row to WMS_ServiceContracts.WMSContract_ID. | WMSContract Line Contract ID; Contract ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_ServiceContracts.WMSContract_ID |  |  |
| `WMSContractLine_LineNo` | Numbering or ordering field used for display, document output or line sequencing. | WMSContract Line Line No; Line No; number; reference | `integer(32,0)` | 32 digits, 0 dp | Yes | Unique group |  |  |
| `WMSContractLine_ServiceCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Line Service Code; Service Code; code; lookup code | `character varying(80)` | 80 chars | Yes |  |  |  |
| `WMSContractLine_ServiceName` | Human-readable name or title displayed to users. | WMSContract Line Service Name; Service Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSContractLine_BillingBasisCode` | Enum/lookup code selected from sys_WMSBillingBasis. | WMSContract Line Billing Basis Code; Billing Basis Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBillingBasis.WMSBillingBasis_Code | **ENUM** `sys_WMSBillingBasis`: `per_order = Per order`, `per_line = Per line`, `per_pallet = Per pallet`, `per_carton = Per carton`, `per_unit = Per unit`, `per_kg = Per kg`, `per_cbm = Per CBM`, `per_day = Per day`, `per_week = Per week`, `per_month = Per month`, `flat = Flat` |  |
| `WMSContractLine_ChargeCodeID` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Line Charge Code ID; Charge Code ID; code; lookup code; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSContractLine_UnitRate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSContract Line Unit Rate; Unit Rate; rate; ROE; exchange rate | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSContractLine_MinimumAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSContract Line Minimum Amount; Minimum Amount; amount; value; total | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSContractLine_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Line Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSContractLine_FreeQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSContract Line Free Quantity; Free Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSContractLine_RulesJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSContract Line Rules JSON; Rules JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSContractLine_IsActive` | Availability flag for new use in the application. | WMSContract Line Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_ServiceContracts`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores customer warehouse service contract headers linked to rates/finance where required.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSContract_ID` | Primary identifier for the wms service contracts row. | WMSContract ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSContract_CustomerProfileID` | Links this row to WMS_CustomerProfiles.WMSCustomerProfile_ID. | WMSContract Customer Profile ID; Customer Profile ID; customer; client; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_CustomerProfiles.WMSCustomerProfile_ID |  |  |
| `WMSContract_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSContract Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSContract_RateContractID` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSContract Rate Contract ID; Rate Contract ID; rate; ROE; exchange rate; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSContract_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | Unique group |  |  |
| `WMSContract_Name` | Human-readable name or title displayed to users. | WMSContract Name; Name | `character varying(180)` | 180 chars | Yes |  |  |  |
| `WMSContract_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSContract Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'active'::character varying` |
| `WMSContract_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSContract_EffectiveFrom` | Date/time used for workflow, validity, routing or external reporting. | WMSContract Effective From; Effective From | `date` | date | Yes |  |  |  |
| `WMSContract_EffectiveTo` | Date/time used for workflow, validity, routing or external reporting. | WMSContract Effective To; Effective To | `date` | date | No |  |  |  |
| `WMSContract_BillingCycleCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSContract Billing Cycle Code; Billing Cycle Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'monthly'::character varying` |
| `WMSContract_RulesJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSContract Rules JSON; Rules JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSContract_CreatedAt` | Timestamp/date when the row was created. | WMSContract Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSContract_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSContract Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_StorageRules`

Function: Configuration table that defines behaviour, reusable rules, governed templates or versioned setup.

Reason for existence: Exists to let administrators change business behaviour by configuration rather than custom code, while keeping versions and approval history traceable.

Purpose: Stores storage charging rules by contract, facility, zone, item, inventory status, customs status, free days and billing basis.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSStorageRule_ID` | Primary identifier for the wms storage rules row. | WMSStorage Rule ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSStorageRule_ContractID` | Links this row to WMS_ServiceContracts.WMSContract_ID. | WMSStorage Rule Contract ID; Contract ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_ServiceContracts.WMSContract_ID |  |  |
| `WMSStorageRule_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSStorage Rule Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSStorageRule_ZoneID` | Links this row to WMS_Zones.WMSZone_ID. | WMSStorage Rule Zone ID; Zone ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Zones.WMSZone_ID |  |  |
| `WMSStorageRule_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSStorage Rule Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSStorageRule_InventoryStatusCode` | Enum/lookup code selected from sys_WMSInventoryStatuses. | WMSStorage Rule Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | No | FK -> sys_WMSInventoryStatuses.WMSInventoryStatus_Code | **ENUM** `sys_WMSInventoryStatuses`: `available = Available`, `allocated = Allocated`, `picked = Picked`, `quarantine = Quarantine`, `damaged = Damaged`, `customs_hold = Customs hold`, `compliance_hold = Compliance hold`, `finance_hold = Finance hold`, `expired = Expired`, `destroyed = Destroyed` |  |
| `WMSStorageRule_CustomsStatusCode` | Enum/lookup code selected from sys_WMSCustomsStatuses. | WMSStorage Rule Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | No | FK -> sys_WMSCustomsStatuses.WMSCustomsStatus_Code | **ENUM** `sys_WMSCustomsStatuses`: `free_circulation = Free circulation`, `bonded = Bonded`, `free_zone = Free zone`, `transit = Transit`, `inward_processing = Inward processing`, `temporary_admission = Temporary admission`, `excise_suspended = Excise suspended`, `unknown = Unknown` |  |
| `WMSStorageRule_BillingBasisCode` | Enum/lookup code selected from sys_WMSBillingBasis. | WMSStorage Rule Billing Basis Code; Billing Basis Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSBillingBasis.WMSBillingBasis_Code | **ENUM** `sys_WMSBillingBasis`: `per_order = Per order`, `per_line = Per line`, `per_pallet = Per pallet`, `per_carton = Per carton`, `per_unit = Per unit`, `per_kg = Per kg`, `per_cbm = Per CBM`, `per_day = Per day`, `per_week = Per week`, `per_month = Per month`, `flat = Flat` |  |
| `WMSStorageRule_FreeDays` | WMSStorage Rule Free Days field for wms storage rules. | WMSStorage Rule Free Days; Free Days | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |
| `WMSStorageRule_UnitRate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSStorage Rule Unit Rate; Unit Rate; rate; ROE; exchange rate | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSStorageRule_MinimumAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSStorage Rule Minimum Amount; Minimum Amount; amount; value; total | `numeric(18,6)` | 18 digits, 6 dp | Yes |  |  | `0` |
| `WMSStorageRule_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSStorage Rule Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars | Yes |  |  | `'GBP'::character varying` |
| `WMSStorageRule_EffectiveFrom` | Date/time used for workflow, validity, routing or external reporting. | WMSStorage Rule Effective From; Effective From | `date` | date | Yes |  |  | `CURRENT_DATE` |
| `WMSStorageRule_EffectiveTo` | Date/time used for workflow, validity, routing or external reporting. | WMSStorage Rule Effective To; Effective To | `date` | date | No |  |  |  |
| `WMSStorageRule_RulesJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSStorage Rule Rules JSON; Rules JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSStorageRule_IsActive` | Availability flag for new use in the application. | WMSStorage Rule Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_TaskAssignments`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores task assignment history to users, roles or equipment.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTaskAssign_ID` | Primary identifier for the wms task assignments row. | WMSTask Assign ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSTaskAssign_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSTask Assign Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSTaskAssign_AssignedUserID` | Links this row to cmp_Users.User_ID. | WMSTask Assign Assigned User ID; Assigned User ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSTaskAssign_AssignedRoleID` | Business role used to classify the row in the UI and validation rules. | WMSTask Assign Assigned Role ID; Assigned Role ID; id; UUID; record identifier | `uuid` | UUID | No |  |  |  |
| `WMSTaskAssign_AssignedEquipmentID` | Links this row to WMS_Equipment.WMSEquipment_ID. | WMSTask Assign Assigned Equipment ID; Assigned Equipment ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Equipment.WMSEquipment_ID |  |  |
| `WMSTaskAssign_AssignedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Assign Assigned At; Assigned At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSTaskAssign_AcceptedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Assign Accepted At; Accepted At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSTaskAssign_ReleasedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Assign Released At; Released At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSTaskAssign_IsCurrent` | WMSTask Assign Is Current field for wms task assignments. | WMSTask Assign Is Current; Is Current | `boolean` | true/false | Yes |  |  | `true` |

### `WMS_TaskEvents`

Function: Event, ledger or history table used to preserve movement, audit, timeline or financial source records.

Reason for existence: Exists to preserve the chronological source of truth for movements, messages, financial postings, status changes or integration events.

Purpose: Stores task status/event timeline entries.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTaskEvent_ID` | Primary identifier for the wms task events row. | WMSTask Event ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSTaskEvent_TaskID` | Links this row to WMS_Tasks.WMSTask_ID. | WMSTask Event Task ID; Task ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Tasks.WMSTask_ID |  |  |
| `WMSTaskEvent_EventTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTask Event Event Type Code; Event Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes |  |  |  |
| `WMSTaskEvent_FromStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSTask Event From Status Code; From Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSTaskEvent_ToStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSTask Event To Status Code; To Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | No |  |  |  |
| `WMSTaskEvent_EventAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Event Event At; Event At | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSTaskEvent_EventBy` | Links this row to cmp_Users.User_ID. | WMSTask Event Event By; Event By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSTaskEvent_Notes` | Free-text content entered by users or generated by the system. | WMSTask Event Notes; Notes; comments | `text` |  | No |  |  |  |
| `WMSTaskEvent_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSTask Event Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |

### `WMS_Tasks`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores mobile and back-office warehouse tasks such as receive, putaway, move, pick, pack, dispatch, count, inspection and VAS.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTask_ID` | Primary identifier for the wms tasks row. | WMSTask ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSTask_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSTask Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSTask_OrderID` | Links this row to WMS_Orders.WMSOrder_ID. | WMSTask Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Orders.WMSOrder_ID |  |  |
| `WMSTask_OrderLineID` | Links this row to WMS_OrderLines.WMSOrderLine_ID. | WMSTask Order Line ID; Order Line ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_OrderLines.WMSOrderLine_ID |  |  |
| `WMSTask_JobID` | Links this row to Job_Header.Job_ID. | WMSTask Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Job_Header.Job_ID |  |  |
| `WMSTask_WorkflowTaskID` | Links this row to Workflow_Tasks.WorkflowTask_ID. | WMSTask Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> Workflow_Tasks.WorkflowTask_ID |  |  |
| `WMSTask_TypeCode` | Enum/lookup code selected from sys_WMSTaskTypes. | WMSTask Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSTaskTypes.WMSTaskType_Code | **ENUM** `sys_WMSTaskTypes`: `receive = Receive`, `putaway = Putaway`, `move = Move`, `pick = Pick`, `pack = Pack`, `dispatch = Dispatch`, `count = Count`, `inspection = Inspection`, `vas = Value-added service`, `admin = Administration` |  |
| `WMSTask_StatusCode` | Enum/lookup code selected from sys_WMSTaskStatuses. | WMSTask Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSTaskStatuses.WMSTaskStatus_Code | **ENUM** `sys_WMSTaskStatuses`: `queued = Queued`, `assigned = Assigned`, `in_progress = In progress`, `blocked = Blocked`, `complete = Complete`, `cancelled = Cancelled` | `'queued'::character varying` |
| `WMSTask_PriorityCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTask Priority Code; Priority Code; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'normal'::character varying` |
| `WMSTask_Title` | Human-readable name or title displayed to users. | WMSTask Title; Title | `character varying(220)` | 220 chars | Yes |  |  |  |
| `WMSTask_Instructions` | Free-text content entered by users or generated by the system. | WMSTask Instructions; Instructions | `text` |  | No |  |  |  |
| `WMSTask_SourceLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSTask Source Location ID; Source Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSTask_TargetLocationID` | Links this row to WMS_Locations.WMSLocation_ID. | WMSTask Target Location ID; Target Location ID; location; place; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Locations.WMSLocation_ID |  |  |
| `WMSTask_ItemID` | Links this row to WMS_Items.WMSItem_ID. | WMSTask Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_Items.WMSItem_ID |  |  |
| `WMSTask_BalanceID` | Links this row to WMS_InventoryBalances.WMSBalance_ID. | WMSTask Balance ID; Balance ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_InventoryBalances.WMSBalance_ID |  |  |
| `WMSTask_HU_ID` | Links this row to WMS_HandlingUnits.WMSHU_ID. | WMSTask HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WMS_HandlingUnits.WMSHU_ID |  |  |
| `WMSTask_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSTask Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp | No |  |  |  |
| `WMSTask_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTask UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSTask_DueAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Due At; Due At; due date; deadline | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSTask_StartedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Started At; Started At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSTask_CompletedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Completed At; Completed At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSTask_CompletedBy` | Links this row to cmp_Users.User_ID. | WMSTask Completed By; Completed By | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSTask_MetadataJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSTask Metadata JSON; Metadata JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSTask_CreatedAt` | Timestamp/date when the row was created. | WMSTask Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSTask_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSTask Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_Waves`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores outbound picking waves.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSWave_ID` | Primary identifier for the wms waves row. | WMSWave ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSWave_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSWave Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSWave_WaveNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSWave Wave Number; Wave Number; number; reference | `character varying(80)` | 80 chars | Yes | Unique group |  |  |
| `WMSWave_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSWave Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars | Yes |  |  | `'planned'::character varying` |
| `WMSWave_PlannedStartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSWave Planned Start At; Planned Start At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSWave_PlannedEndAt` | Date/time used for workflow, validity, routing or external reporting. | WMSWave Planned End At; Planned End At | `timestamp with time zone` | timestamp | No |  |  |  |
| `WMSWave_CustomerOrgID` | Links this row to Org_Master.Org_ID. | WMSWave Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID | No | FK -> Org_Master.Org_ID |  |  |
| `WMSWave_CreatedAt` | Timestamp/date when the row was created. | WMSWave Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSWave_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSWave Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |

### `WMS_Zones`

Function: Operational master/header table that owns a business object or lifecycle record in its module.

Reason for existence: Exists to keep this module-specific business concept separate from other domains while still linking back to shared jobs, organisations, offices, users and documents.

Purpose: Stores warehouse zones such as bonded, quarantine, pick face, bulk, receiving, dispatch, returns, cold-chain and dangerous-goods areas.

Primary UI/API use: Use for create/edit/detail screens and module APIs where users or integrations manage this business object. Prefer backend endpoints that enforce workflow, audit and security.

AI agent guidance: Use table purpose, foreign keys and field aliases to determine whether this table is the authoritative target. Ask a clarifying multiple-choice question when several fields match the same wording.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSZone_ID` | Primary identifier for the wms zones row. | WMSZone ID; ID; UUID; record identifier | `uuid` | UUID | Yes | PK |  | `gen_random_uuid()` |
| `WMSZone_FacilityID` | Links this row to WMS_Facilities.WMSFacility_ID. | WMSZone Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID | Yes | Unique group; FK -> WMS_Facilities.WMSFacility_ID |  |  |
| `WMSZone_LegacyAreaID` | Links this row to WarehouseAreas.Id. | WMSZone Legacy Area ID; Legacy Area ID; id; UUID; record identifier | `uuid` | UUID | No | FK -> WarehouseAreas.Id |  |  |
| `WMSZone_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSZone Code; Code; lookup code | `character varying(50)` | 50 chars | Yes | Unique group |  |  |
| `WMSZone_Name` | Human-readable name or title displayed to users. | WMSZone Name; Name | `character varying(160)` | 160 chars | Yes |  |  |  |
| `WMSZone_TypeCode` | Enum/lookup code selected from sys_WMSZoneTypes. | WMSZone Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSZoneTypes.WMSZoneType_Code | **ENUM** `sys_WMSZoneTypes`: `bulk = Bulk storage`, `pick_face = Pick face`, `bonded = Bonded zone`, `quarantine = Quarantine`, `crossdock = Cross-dock`, `returns = Returns`, `dangerous_goods = Dangerous goods`, `cold_chain = Cold chain`, `dispatch = Dispatch`, `receiving = Receiving`, `yard = Yard`, `admin = Administration` |  |
| `WMSZone_StatusCode` | Enum/lookup code selected from sys_WMSLocationStatuses. | WMSZone Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars | Yes | FK -> sys_WMSLocationStatuses.WMSLocationStatus_Code | **ENUM** `sys_WMSLocationStatuses`: `available = Available`, `occupied = Occupied`, `full = Full`, `blocked = Blocked`, `maintenance = Maintenance`, `customs_locked = Customs locked`, `inactive = Inactive` | `'available'::character varying` |
| `WMSZone_AllowsBondedStock` | WMSZone Allows Bonded Stock field for wms zones. | WMSZone Allows Bonded Stock; Allows Bonded Stock | `boolean` | true/false | Yes |  |  | `false` |
| `WMSZone_AllowsCustomsControlledStock` | WMSZone Allows Customs Controlled Stock field for wms zones. | WMSZone Allows Customs Controlled Stock; Allows Customs Controlled Stock | `boolean` | true/false | Yes |  |  | `false` |
| `WMSZone_TemperatureMinC` | WMSZone Temperature Min C field for wms zones. | WMSZone Temperature Min C; Temperature Min C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSZone_TemperatureMaxC` | WMSZone Temperature Max C field for wms zones. | WMSZone Temperature Max C; Temperature Max C | `numeric(9,3)` | 9 digits, 3 dp | No |  |  |  |
| `WMSZone_SettingsJSON` | Structured JSON payload/configuration. Do not expose raw editing to normal users unless specifically required. | WMSZone Settings JSON; Settings JSON | `jsonb` | JSON | Yes |  |  | `'{}'::jsonb` |
| `WMSZone_IsActive` | Availability flag for new use in the application. | WMSZone Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSZone_CreatedAt` | Timestamp/date when the row was created. | WMSZone Created At; Created At; created date; created by | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSZone_CreatedBy` | Links this row to cmp_Users.User_ID. | WMSZone Created By; Created By; created date | `uuid` | UUID | No | FK -> cmp_Users.User_ID |  |  |
| `WMSZone_UpdatedAt` | Timestamp/date when the row was last changed. | WMSZone Updated At; Updated At; updated date; modified date | `timestamp with time zone` | timestamp | Yes |  |  | `now()` |
| `WMSZone_IsDeleted` | Soft-delete flag. Default UI lists should normally exclude these rows. | WMSZone Is Deleted; Is Deleted; deleted flag; voided | `boolean` | true/false | Yes |  |  | `false` |

### `sys_WMSAIInsightTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSAIInsight Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAIInsightType_Code` | Primary identifier for the wmsaiinsight types row. | WMSAIInsight Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSAIInsightType_Name` | Human-readable lookup label shown in the UI. | WMSAIInsight Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSAIInsightType_Description` | Longer explanation of the lookup value. | WMSAIInsight Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSAIInsightType_IsActionable` | WMSAIInsight Type Is Actionable field for wmsaiinsight types. | WMSAIInsight Type Is Actionable; Is Actionable | `boolean` | true/false | Yes |  |  | `true` |
| `WMSAIInsightType_IsActive` | Controls whether the value is available for new records. | WMSAIInsight Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSAIInsightType_SortOrder` | Display order for dropdowns and badges. | WMSAIInsight Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSAdjustmentStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSAdjustment Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSAdjustmentStatus_Code` | Primary identifier for the wmsadjustment statuses row. | WMSAdjustment Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSAdjustmentStatus_Name` | Human-readable lookup label shown in the UI. | WMSAdjustment Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSAdjustmentStatus_Description` | Longer explanation of the lookup value. | WMSAdjustment Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSAdjustmentStatus_IsPosted` | Lifecycle status for workflow, badges and filtering. | WMSAdjustment Status Is Posted; Is Posted; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSAdjustmentStatus_IsFinal` | Marks whether this status represents an end state. | WMSAdjustment Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSAdjustmentStatus_IsActive` | Controls whether the value is available for new records. | WMSAdjustment Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSAdjustmentStatus_SortOrder` | Display order for dropdowns and badges. | WMSAdjustment Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBillingBasis`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBilling Basis. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBillingBasis_Code` | Primary identifier for the wmsbilling basis row. | WMSBilling Basis Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBillingBasis_Name` | Human-readable lookup label shown in the UI. | WMSBilling Basis Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBillingBasis_Description` | Longer explanation of the lookup value. | WMSBilling Basis Description; Description; details | `text` |  | No |  |  |  |
| `WMSBillingBasis_DefaultUOM` | Marks the default value within its parent scope. | WMSBilling Basis Default UOM; Default UOM | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSBillingBasis_IsActive` | Controls whether the value is available for new records. | WMSBilling Basis Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBillingBasis_SortOrder` | Display order for dropdowns and badges. | WMSBilling Basis Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBillingStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBilling Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBillingStatus_Code` | Primary identifier for the wmsbilling statuses row. | WMSBilling Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBillingStatus_Name` | Human-readable lookup label shown in the UI. | WMSBilling Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBillingStatus_Description` | Longer explanation of the lookup value. | WMSBilling Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSBillingStatus_IsBillable` | Lifecycle status for workflow, badges and filtering. | WMSBilling Status Is Billable; Is Billable; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBillingStatus_IsFinal` | Marks whether this status represents an end state. | WMSBilling Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBillingStatus_IsActive` | Controls whether the value is available for new records. | WMSBilling Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBillingStatus_SortOrder` | Display order for dropdowns and badges. | WMSBilling Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBondedDiscrepancyTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBonded Discrepancy Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondedDiscrepancyType_Code` | Primary identifier for the wmsbonded discrepancy types row. | WMSBonded Discrepancy Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBondedDiscrepancyType_Name` | Human-readable lookup label shown in the UI. | WMSBonded Discrepancy Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBondedDiscrepancyType_Description` | Longer explanation of the lookup value. | WMSBonded Discrepancy Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondedDiscrepancyType_RequiresCustomsReview` | WMSBonded Discrepancy Type Requires Customs Review field for wmsbonded discrepancy types. | WMSBonded Discrepancy Type Requires Customs Review; Requires Customs Review | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedDiscrepancyType_IsActive` | Controls whether the value is available for new records. | WMSBonded Discrepancy Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedDiscrepancyType_SortOrder` | Display order for dropdowns and badges. | WMSBonded Discrepancy Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBondedMovementTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBonded Movement Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondedMovementType_Code` | Primary identifier for the wmsbonded movement types row. | WMSBonded Movement Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBondedMovementType_Name` | Human-readable lookup label shown in the UI. | WMSBonded Movement Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBondedMovementType_Description` | Longer explanation of the lookup value. | WMSBonded Movement Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondedMovementType_IsRemoval` | WMSBonded Movement Type Is Removal field for wmsbonded movement types. | WMSBonded Movement Type Is Removal; Is Removal | `boolean` | true/false | Yes |  |  | `false` |
| `WMSBondedMovementType_IsActive` | Controls whether the value is available for new records. | WMSBonded Movement Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedMovementType_SortOrder` | Display order for dropdowns and badges. | WMSBonded Movement Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBondedProcedureTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBonded Procedure Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondedProcedureType_Code` | Primary identifier for the wmsbonded procedure types row. | WMSBonded Procedure Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBondedProcedureType_Name` | Human-readable lookup label shown in the UI. | WMSBonded Procedure Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBondedProcedureType_Description` | Longer explanation of the lookup value. | WMSBonded Procedure Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondedProcedureType_IsDutySuspensive` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBonded Procedure Type Is Duty Suspensive; Is Duty Suspensive | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedProcedureType_IsActive` | Controls whether the value is available for new records. | WMSBonded Procedure Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedProcedureType_SortOrder` | Display order for dropdowns and badges. | WMSBonded Procedure Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBondedRemovalTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBonded Removal Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondedRemovalType_Code` | Primary identifier for the wmsbonded removal types row. | WMSBonded Removal Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBondedRemovalType_Name` | Human-readable lookup label shown in the UI. | WMSBonded Removal Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBondedRemovalType_Description` | Longer explanation of the lookup value. | WMSBonded Removal Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondedRemovalType_RequiresDeclaration` | WMSBonded Removal Type Requires Declaration field for wmsbonded removal types. | WMSBonded Removal Type Requires Declaration; Requires Declaration | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedRemovalType_IsActive` | Controls whether the value is available for new records. | WMSBonded Removal Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedRemovalType_SortOrder` | Display order for dropdowns and badges. | WMSBonded Removal Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSBondedWarehouseTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSBonded Warehouse Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSBondedWarehouseType_Code` | Primary identifier for the wmsbonded warehouse types row. | WMSBonded Warehouse Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSBondedWarehouseType_Name` | Human-readable lookup label shown in the UI. | WMSBonded Warehouse Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSBondedWarehouseType_Description` | Longer explanation of the lookup value. | WMSBonded Warehouse Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSBondedWarehouseType_JurisdictionHint` | URL/URI or external resource reference. | WMSBonded Warehouse Type Jurisdiction Hint; Jurisdiction Hint | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSBondedWarehouseType_IsActive` | Controls whether the value is available for new records. | WMSBonded Warehouse Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSBondedWarehouseType_SortOrder` | Display order for dropdowns and badges. | WMSBonded Warehouse Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSCustomsStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSCustoms Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCustomsStatus_Code` | Primary identifier for the wmscustoms statuses row. | WMSCustoms Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSCustomsStatus_Name` | Human-readable lookup label shown in the UI. | WMSCustoms Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSCustomsStatus_Description` | Longer explanation of the lookup value. | WMSCustoms Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSCustomsStatus_IsDutySuspended` | Lifecycle status for workflow, badges and filtering. | WMSCustoms Status Is Duty Suspended; Is Duty Suspended; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCustomsStatus_IsCustomsControlled` | Lifecycle status for workflow, badges and filtering. | WMSCustoms Status Is Customs Controlled; Is Customs Controlled; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCustomsStatus_IsActive` | Controls whether the value is available for new records. | WMSCustoms Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSCustomsStatus_SortOrder` | Display order for dropdowns and badges. | WMSCustoms Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSCycleCountStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSCycle Count Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCycleCountStatus_Code` | Primary identifier for the wmscycle count statuses row. | WMSCycle Count Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSCycleCountStatus_Name` | Human-readable lookup label shown in the UI. | WMSCycle Count Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSCycleCountStatus_Description` | Longer explanation of the lookup value. | WMSCycle Count Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSCycleCountStatus_IsFinal` | Marks whether this status represents an end state. | WMSCycle Count Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCycleCountStatus_IsActive` | Controls whether the value is available for new records. | WMSCycle Count Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSCycleCountStatus_SortOrder` | Display order for dropdowns and badges. | WMSCycle Count Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSExceptionTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSException Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSExceptionType_Code` | Primary identifier for the wmsexception types row. | WMSException Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSExceptionType_Name` | Human-readable lookup label shown in the UI. | WMSException Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSExceptionType_Description` | Longer explanation of the lookup value. | WMSException Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSExceptionType_DefaultSeverityCode` | Stable lookup code stored by application records. | WMSException Type Default Severity Code; Default Severity Code; code; lookup code | `character varying(30)` | 30 chars | Yes |  |  | `'medium'::character varying` |
| `WMSExceptionType_IsActive` | Controls whether the value is available for new records. | WMSException Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSExceptionType_SortOrder` | Display order for dropdowns and badges. | WMSException Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSFacilityCapabilities`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSFacility Capabilities. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSCapability_Code` | Primary identifier for the wmsfacility capabilities row. | WMSCapability Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSCapability_Name` | Human-readable lookup label shown in the UI. | WMSCapability Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSCapability_Description` | Longer explanation of the lookup value. | WMSCapability Description; Description; details | `text` |  | No |  |  |  |
| `WMSCapability_IsComplianceSensitive` | WMSCapability Is Compliance Sensitive field for wmsfacility capabilities. | WMSCapability Is Compliance Sensitive; Is Compliance Sensitive | `boolean` | true/false | Yes |  |  | `false` |
| `WMSCapability_IsActive` | Controls whether the value is available for new records. | WMSCapability Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSCapability_SortOrder` | Display order for dropdowns and badges. | WMSCapability Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSFacilityTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSFacility Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSFacilityType_Code` | Primary identifier for the wmsfacility types row. | WMSFacility Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSFacilityType_Name` | Human-readable lookup label shown in the UI. | WMSFacility Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSFacilityType_Description` | Longer explanation of the lookup value. | WMSFacility Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSFacilityType_IsBondedCandidate` | Date/time used for workflow, validity, routing or external reporting. | WMSFacility Type Is Bonded Candidate; Is Bonded Candidate | `boolean` | true/false | Yes |  |  | `false` |
| `WMSFacilityType_IsActive` | Controls whether the value is available for new records. | WMSFacility Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSFacilityType_SortOrder` | Display order for dropdowns and badges. | WMSFacility Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSHandlingUnitTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSHandling Unit Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHUType_Code` | Primary identifier for the wmshandling unit types row. | WMSHUType Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSHUType_Name` | Human-readable lookup label shown in the UI. | WMSHUType Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSHUType_Description` | Longer explanation of the lookup value. | WMSHUType Description; Description; details | `text` |  | No |  |  |  |
| `WMSHUType_IsContainer` | WMSHUType Is Container field for wmshandling unit types. | WMSHUType Is Container; Is Container | `boolean` | true/false | Yes |  |  | `false` |
| `WMSHUType_IsActive` | Controls whether the value is available for new records. | WMSHUType Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHUType_SortOrder` | Display order for dropdowns and badges. | WMSHUType Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSHoldStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSHold Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHoldStatus_Code` | Primary identifier for the wmshold statuses row. | WMSHold Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSHoldStatus_Name` | Human-readable lookup label shown in the UI. | WMSHold Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSHoldStatus_Description` | Longer explanation of the lookup value. | WMSHold Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSHoldStatus_IsOpen` | Lifecycle status for workflow, badges and filtering. | WMSHold Status Is Open; Is Open; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHoldStatus_IsBlocking` | Lifecycle status for workflow, badges and filtering. | WMSHold Status Is Blocking; Is Blocking; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHoldStatus_IsActive` | Controls whether the value is available for new records. | WMSHold Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHoldStatus_SortOrder` | Display order for dropdowns and badges. | WMSHold Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSHoldTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSHold Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSHoldType_Code` | Primary identifier for the wmshold types row. | WMSHold Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSHoldType_Name` | Human-readable lookup label shown in the UI. | WMSHold Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSHoldType_Description` | Longer explanation of the lookup value. | WMSHold Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSHoldType_IsBlocking` | WMSHold Type Is Blocking field for wmshold types. | WMSHold Type Is Blocking; Is Blocking | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHoldType_IsActive` | Controls whether the value is available for new records. | WMSHold Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSHoldType_SortOrder` | Display order for dropdowns and badges. | WMSHold Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSIntegrationEventStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSIntegration Event Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSIntegrationStatus_Code` | Primary identifier for the wmsintegration event statuses row. | WMSIntegration Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSIntegrationStatus_Name` | Human-readable lookup label shown in the UI. | WMSIntegration Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSIntegrationStatus_Description` | Longer explanation of the lookup value. | WMSIntegration Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSIntegrationStatus_IsFinal` | Marks whether this status represents an end state. | WMSIntegration Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSIntegrationStatus_IsActive` | Controls whether the value is available for new records. | WMSIntegration Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSIntegrationStatus_SortOrder` | Display order for dropdowns and badges. | WMSIntegration Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSInventoryStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSInventory Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSInventoryStatus_Code` | Primary identifier for the wmsinventory statuses row. | WMSInventory Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSInventoryStatus_Name` | Human-readable lookup label shown in the UI. | WMSInventory Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSInventoryStatus_Description` | Longer explanation of the lookup value. | WMSInventory Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSInventoryStatus_IsAvailableCandidate` | Lifecycle status for workflow, badges and filtering. | WMSInventory Status Is Available Candidate; Is Available Candidate; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSInventoryStatus_IsActive` | Controls whether the value is available for new records. | WMSInventory Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSInventoryStatus_SortOrder` | Display order for dropdowns and badges. | WMSInventory Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSLocationStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSLocation Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSLocationStatus_Code` | Primary identifier for the wmslocation statuses row. | WMSLocation Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSLocationStatus_Name` | Human-readable lookup label shown in the UI. | WMSLocation Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSLocationStatus_Description` | Longer explanation of the lookup value. | WMSLocation Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSLocationStatus_IsUsable` | Lifecycle status for workflow, badges and filtering. | WMSLocation Status Is Usable; Is Usable; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocationStatus_IsActive` | Controls whether the value is available for new records. | WMSLocation Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocationStatus_SortOrder` | Display order for dropdowns and badges. | WMSLocation Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSLocationTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSLocation Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSLocationType_Code` | Primary identifier for the wmslocation types row. | WMSLocation Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSLocationType_Name` | Human-readable lookup label shown in the UI. | WMSLocation Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSLocationType_Description` | Longer explanation of the lookup value. | WMSLocation Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSLocationType_IsPickable` | WMSLocation Type Is Pickable field for wmslocation types. | WMSLocation Type Is Pickable; Is Pickable | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocationType_IsActive` | Controls whether the value is available for new records. | WMSLocation Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSLocationType_SortOrder` | Display order for dropdowns and badges. | WMSLocation Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSOrderLineStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSOrder Line Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderLineStatus_Code` | Primary identifier for the wmsorder line statuses row. | WMSOrder Line Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSOrderLineStatus_Name` | Human-readable lookup label shown in the UI. | WMSOrder Line Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSOrderLineStatus_Description` | Longer explanation of the lookup value. | WMSOrder Line Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSOrderLineStatus_IsOpen` | Lifecycle status for workflow, badges and filtering. | WMSOrder Line Status Is Open; Is Open; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSOrderLineStatus_IsFinal` | Marks whether this status represents an end state. | WMSOrder Line Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrderLineStatus_IsActive` | Controls whether the value is available for new records. | WMSOrder Line Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSOrderLineStatus_SortOrder` | Display order for dropdowns and badges. | WMSOrder Line Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSOrderStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSOrder Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderStatus_Code` | Primary identifier for the wmsorder statuses row. | WMSOrder Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSOrderStatus_Name` | Human-readable lookup label shown in the UI. | WMSOrder Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSOrderStatus_Description` | Longer explanation of the lookup value. | WMSOrder Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSOrderStatus_IsOpen` | Lifecycle status for workflow, badges and filtering. | WMSOrder Status Is Open; Is Open; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSOrderStatus_IsFinal` | Marks whether this status represents an end state. | WMSOrder Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrderStatus_IsActive` | Controls whether the value is available for new records. | WMSOrder Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSOrderStatus_SortOrder` | Display order for dropdowns and badges. | WMSOrder Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSOrderTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSOrder Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSOrderType_Code` | Primary identifier for the wmsorder types row. | WMSOrder Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSOrderType_Name` | Human-readable lookup label shown in the UI. | WMSOrder Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSOrderType_Description` | Longer explanation of the lookup value. | WMSOrder Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSOrderType_DirectionCode` | Stable lookup code stored by application records. | WMSOrder Type Direction Code; Direction Code; code; lookup code | `character varying(20)` | 20 chars | No |  |  |  |
| `WMSOrderType_IsBonded` | WMSOrder Type Is Bonded field for wmsorder types. | WMSOrder Type Is Bonded; Is Bonded | `boolean` | true/false | Yes |  |  | `false` |
| `WMSOrderType_IsActive` | Controls whether the value is available for new records. | WMSOrder Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSOrderType_SortOrder` | Display order for dropdowns and badges. | WMSOrder Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSScanEventTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSScan Event Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSScanEventType_Code` | Primary identifier for the wmsscan event types row. | WMSScan Event Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSScanEventType_Name` | Human-readable lookup label shown in the UI. | WMSScan Event Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSScanEventType_Description` | Longer explanation of the lookup value. | WMSScan Event Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSScanEventType_IsExceptionCandidate` | Date/time used for workflow, validity, routing or external reporting. | WMSScan Event Type Is Exception Candidate; Is Exception Candidate | `boolean` | true/false | Yes |  |  | `false` |
| `WMSScanEventType_IsActive` | Controls whether the value is available for new records. | WMSScan Event Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSScanEventType_SortOrder` | Display order for dropdowns and badges. | WMSScan Event Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSTaskStatuses`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSTask Statuses. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTaskStatus_Code` | Primary identifier for the wmstask statuses row. | WMSTask Status Code; Code; status; stage; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSTaskStatus_Name` | Human-readable lookup label shown in the UI. | WMSTask Status Name; Name; status; stage | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSTaskStatus_Description` | Longer explanation of the lookup value. | WMSTask Status Description; Description; status; stage; details | `text` |  | No |  |  |  |
| `WMSTaskStatus_IsOpen` | Lifecycle status for workflow, badges and filtering. | WMSTask Status Is Open; Is Open; status; stage | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTaskStatus_IsFinal` | Marks whether this status represents an end state. | WMSTask Status Is Final; Is Final; status; stage | `boolean` | true/false | Yes |  |  | `false` |
| `WMSTaskStatus_IsActive` | Controls whether the value is available for new records. | WMSTask Status Is Active; Is Active; status; stage; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTaskStatus_SortOrder` | Display order for dropdowns and badges. | WMSTask Status Sort Order; Sort Order; status; stage | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSTaskTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSTask Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTaskType_Code` | Primary identifier for the wmstask types row. | WMSTask Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSTaskType_Name` | Human-readable lookup label shown in the UI. | WMSTask Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSTaskType_Description` | Longer explanation of the lookup value. | WMSTask Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSTaskType_IsMobileTask` | WMSTask Type Is Mobile Task field for wmstask types. | WMSTask Type Is Mobile Task; Is Mobile Task | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTaskType_IsActive` | Controls whether the value is available for new records. | WMSTask Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTaskType_SortOrder` | Display order for dropdowns and badges. | WMSTask Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSTransactionTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSTransaction Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSTransactionType_Code` | Primary identifier for the wmstransaction types row. | WMSTransaction Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSTransactionType_Name` | Human-readable lookup label shown in the UI. | WMSTransaction Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSTransactionType_Description` | Longer explanation of the lookup value. | WMSTransaction Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSTransactionType_AffectsOnHand` | WMSTransaction Type Affects On Hand field for wmstransaction types. | WMSTransaction Type Affects On Hand; Affects On Hand | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTransactionType_DefaultSign` | WMSTransaction Type Default Sign field for wmstransaction types. | WMSTransaction Type Default Sign; Default Sign | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `1` |
| `WMSTransactionType_IsActive` | Controls whether the value is available for new records. | WMSTransaction Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSTransactionType_SortOrder` | Display order for dropdowns and badges. | WMSTransaction Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |

### `sys_WMSZoneTypes`

Function: Lookup/reference table used by dropdowns, validation rules, status badges, document generation and integration mapping.

Reason for existence: Exists to keep codes and labels governed in one place. This avoids hard-coded UI values and lets regional/local feature sets add values safely.

Purpose: Lookup/reference table for WMSZone Types. Frontend dropdowns, badges and validation should load values from this table rather than hard-code them.

Primary UI/API use: Frontend should load values for dropdowns, filters and badges. Backend should validate submitted codes/IDs against this table and avoid hard-coded lists.

AI agent guidance: Use to interpret user wording, validate codes and present multiple-choice values. Do not treat labels as stable primary keys.

| Field | Purpose | AI / Natural Language Aliases | Type | Size | Required | Key / Relation | Enum / Lookup | Default |
|---|---|---|---|---|---|---|---|---|
| `WMSZoneType_Code` | Primary identifier for the wmszone types row. | WMSZone Type Code; Code; lookup code | `character varying(60)` | 60 chars | Yes | PK |  |  |
| `WMSZoneType_Name` | Human-readable lookup label shown in the UI. | WMSZone Type Name; Name | `character varying(140)` | 140 chars | Yes |  |  |  |
| `WMSZoneType_Description` | Longer explanation of the lookup value. | WMSZone Type Description; Description; details | `text` |  | No |  |  |  |
| `WMSZoneType_AllowsStock` | WMSZone Type Allows Stock field for wmszone types. | WMSZone Type Allows Stock; Allows Stock | `boolean` | true/false | Yes |  |  | `true` |
| `WMSZoneType_IsActive` | Controls whether the value is available for new records. | WMSZone Type Is Active; Is Active; active flag; enabled | `boolean` | true/false | Yes |  |  | `true` |
| `WMSZoneType_SortOrder` | Display order for dropdowns and badges. | WMSZone Type Sort Order; Sort Order | `integer(32,0)` | 32 digits, 0 dp | Yes |  |  | `0` |


## Warehouse Read Model Views

### `WMS_BillingEventQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms billing event queue without duplicating the underlying business data.

Purpose: Read-only view for wms billing event queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBillEvent_ID` | WMSBill Event ID field for wms billing event queue. | WMSBill Event ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBillEvent_FacilityID` | WMSBill Event Facility ID field for wms billing event queue. | WMSBill Event Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSBillEvent_CustomerOrgID` | WMSBill Event Customer Org ID field for wms billing event queue. | WMSBill Event Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSBillEvent_OrderID` | WMSBill Event Order ID field for wms billing event queue. | WMSBill Event Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSBillEvent_JobID` | WMSBill Event Job ID field for wms billing event queue. | WMSBill Event Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSBillEvent_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBill Event Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBillEvent_EventTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBill Event Event Type Code; Event Type Code; code; lookup code | `character varying(80)` | 80 chars |
| `WMSBillEvent_EventDate` | Date/time used for workflow, validity, routing or external reporting. | WMSBill Event Event Date; Event Date | `date` | date |
| `WMSBillEvent_Description` | Description shown in forms, grids or support screens. | WMSBill Event Description; Description; details | `text` |  |
| `WMSBillEvent_Quantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBill Event Quantity; Quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBillEvent_UnitRate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Event Unit Rate; Unit Rate; rate; ROE; exchange rate | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBillEvent_NetAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBill Event Net Amount; Net Amount; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp |
| `WMSBillEvent_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBill Event Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars |

### `WMS_BondedReleaseQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms bonded release queue without duplicating the underlying business data.

Purpose: Read-only view for wms bonded release queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBondRemoval_ID` | WMSBond Removal ID field for wms bonded release queue. | WMSBond Removal ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBondRemoval_FacilityID` | WMSBond Removal Facility ID field for wms bonded release queue. | WMSBond Removal Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSBondRemoval_OrderID` | WMSBond Removal Order ID field for wms bonded release queue. | WMSBond Removal Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSBondRemoval_JobID` | WMSBond Removal Job ID field for wms bonded release queue. | WMSBond Removal Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSBondRemoval_RemovalNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Removal Removal Number; Removal Number; number; reference | `character varying(120)` | 120 chars |
| `WMSBondRemoval_RemovalTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Removal Removal Type Code; Removal Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBondRemoval_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Removal Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars |
| `WMSBondRemoval_DeclarationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Removal Declaration Reference; Declaration Reference; reference; external reference | `character varying(120)` | 120 chars |
| `WMSBondRemoval_CustomsReleaseReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Removal Customs Release Reference; Customs Release Reference; reference; external reference | `character varying(120)` | 120 chars |
| `WMSBondRemoval_RequiresFinanceRelease` | WMSBond Removal Requires Finance Release field for wms bonded release queue. | WMSBond Removal Requires Finance Release; Requires Finance Release | `boolean` | true/false |
| `WMSBondRemoval_RequiresComplianceRelease` | WMSBond Removal Requires Compliance Release field for wms bonded release queue. | WMSBond Removal Requires Compliance Release; Requires Compliance Release | `boolean` | true/false |
| `LineCount` | Numbering or ordering field used for display, document output or line sequencing. | Line Count | `integer(32,0)` | 32 digits, 0 dp |
| `RemovalQuantity` | Cargo measurement used for operational, rating, customs or document output. | Removal Quantity; quantity; qty | `numeric` |  |
| `DutyDueAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Duty Due Amount; amount; value; total | `numeric` |  |
| `TaxDueAmount` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Tax Due Amount; amount; value; total | `numeric` |  |

### `WMS_BondedStockSummary`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms bonded stock summary without duplicating the underlying business data.

Purpose: Read-only view for wms bonded stock summary. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBondInvLink_ID` | WMSBond Inv Link ID field for wms bonded stock summary. | WMSBond Inv Link ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBondEntry_ID` | WMSBond Entry ID field for wms bonded stock summary. | WMSBond Entry ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBondEntry_EntryReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Entry Entry Reference; Entry Reference; reference; external reference | `character varying(120)` | 120 chars |
| `WMSBondEntry_DeclarationReference` | Reference value used to link external systems, documents or user-visible identifiers. | WMSBond Entry Declaration Reference; Declaration Reference; reference; external reference | `character varying(120)` | 120 chars |
| `WMSBondEntry_ProcedureTypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Procedure Type Code; Procedure Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBondEntry_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBond Entry Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars |
| `WMSBondEntryLine_ID` | Numbering or ordering field used for display, document output or line sequencing. | WMSBond Entry Line ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBondEntryLine_HSCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Line HSCode; HSCode; code; lookup code | `character varying(20)` | 20 chars |
| `WMSBondEntryLine_CountryOfOriginCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Line Country Of Origin Code; Country Of Origin Code; code; lookup code; country; nation | `character varying(2)` | 2 chars |
| `WMSBalance_ID` | WMSBalance ID field for wms bonded stock summary. | WMSBalance ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBalance_FacilityID` | WMSBalance Facility ID field for wms bonded stock summary. | WMSBalance Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSBalance_CustomerOrgID` | WMSBalance Customer Org ID field for wms bonded stock summary. | WMSBalance Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSItem_SKU` | WMSItem SKU field for wms bonded stock summary. | WMSItem SKU; SKU | `character varying(120)` | 120 chars |
| `WMSItem_Description` | Description shown in forms, grids or support screens. | WMSItem Description; Description; details | `character varying(300)` | 300 chars |
| `WMSBalance_LocationID` | WMSBalance Location ID field for wms bonded stock summary. | WMSBalance Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID |
| `WMSLocation_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Code; Code; lookup code | `character varying(80)` | 80 chars |
| `WMSBondInvLink_LinkedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Inv Link Linked Quantity; Linked Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBondInvLink_RemainingQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBond Inv Link Remaining Quantity; Remaining Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance On Hand Quantity; On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_HeldQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Held Quantity; Held Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_AvailableQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Available Quantity; Available Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBondEntry_TotalDutyEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Total Duty Estimate; Total Duty Estimate; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp |
| `WMSBondEntry_TotalTaxEstimate` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | WMSBond Entry Total Tax Estimate; Total Tax Estimate; amount; value; total | `numeric(18,4)` | 18 digits, 4 dp |
| `WMSBondEntry_CurrencyCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBond Entry Currency Code; Currency Code; code; lookup code; currency | `character varying(3)` | 3 chars |

### `WMS_CustomerPortalStock`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms customer portal stock without duplicating the underlying business data.

Purpose: Read-only view for wms customer portal stock. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBalance_CustomerOrgID` | WMSBalance Customer Org ID field for wms customer portal stock. | WMSBalance Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSBalance_FacilityID` | WMSBalance Facility ID field for wms customer portal stock. | WMSBalance Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSItem_SKU` | WMSItem SKU field for wms customer portal stock. | WMSItem SKU; SKU | `character varying(120)` | 120 chars |
| `WMSItem_Description` | Description shown in forms, grids or support screens. | WMSItem Description; Description; details | `character varying(300)` | 300 chars |
| `WMSLocation_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Code; Code; lookup code | `character varying(80)` | 80 chars |
| `WMSLot_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSLot Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars |
| `WMSBalance_InventoryStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBalance Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBalance_CustomsStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBalance Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBalance_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBalance UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars |
| `WMSBalance_OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance On Hand Quantity; On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_AvailableQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Available Quantity; Available Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_FirstReceiptAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance First Receipt At; First Receipt At | `timestamp with time zone` | timestamp |
| `WMSBalance_LastMovementAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance Last Movement At; Last Movement At | `timestamp with time zone` | timestamp |

### `WMS_Dashboard`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms dashboard without duplicating the underlying business data.

Purpose: Read-only view for wms dashboard. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSFacility_ID` | WMSFacility ID field for wms dashboard. | WMSFacility ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility Code; Code; lookup code | `character varying(40)` | 40 chars |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `OpenOrderCount` | Open Order Count field for wms dashboard. | Open Order Count | `integer(32,0)` | 32 digits, 0 dp |
| `OpenTaskCount` | Open Task Count field for wms dashboard. | Open Task Count | `integer(32,0)` | 32 digits, 0 dp |
| `OpenExceptionCount` | Open Exception Count field for wms dashboard. | Open Exception Count | `integer(32,0)` | 32 digits, 0 dp |
| `OpenHoldCount` | Open Hold Count field for wms dashboard. | Open Hold Count | `integer(32,0)` | 32 digits, 0 dp |
| `TotalOnHandQuantity` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Total On Hand Quantity; amount; value; total; quantity; qty | `numeric` |  |
| `TotalAvailableQuantity` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Total Available Quantity; amount; value; total; quantity; qty | `numeric` |  |
| `TotalHeldQuantity` | Monetary or calculated numeric value used for costing, pricing, customs or reporting. | Total Held Quantity; amount; value; total; quantity; qty | `numeric` |  |

### `WMS_ExceptionQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms exception queue without duplicating the underlying business data.

Purpose: Read-only view for wms exception queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSException_ID` | WMSException ID field for wms exception queue. | WMSException ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSException_FacilityID` | WMSException Facility ID field for wms exception queue. | WMSException Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSException_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSException Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSException_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSException Status Code; Status Code; status; stage; code; lookup code | `character varying(40)` | 40 chars |
| `WMSException_SeverityCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSException Severity Code; Severity Code; code; lookup code | `character varying(30)` | 30 chars |
| `WMSException_Title` | Human-readable name or title displayed to users. | WMSException Title; Title | `character varying(220)` | 220 chars |
| `WMSException_OrderID` | WMSException Order ID field for wms exception queue. | WMSException Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSException_JobID` | WMSException Job ID field for wms exception queue. | WMSException Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSException_WorkflowTaskID` | WMSException Workflow Task ID field for wms exception queue. | WMSException Workflow Task ID; Workflow Task ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSException_RaisedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Raised At; Raised At | `timestamp with time zone` | timestamp |
| `WMSException_ResolvedAt` | Date/time used for workflow, validity, routing or external reporting. | WMSException Resolved At; Resolved At | `timestamp with time zone` | timestamp |

### `WMS_InboundQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms inbound queue without duplicating the underlying business data.

Purpose: Read-only view for wms inbound queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSOrder_ID` | WMSOrder ID field for wms inbound queue. | WMSOrder ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_FacilityID` | WMSOrder Facility ID field for wms inbound queue. | WMSOrder Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSOrder_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSOrder_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSOrder Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSOrder_CustomerOrgID` | WMSOrder Customer Org ID field for wms inbound queue. | WMSOrder Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSOrder_JobID` | WMSOrder Job ID field for wms inbound queue. | WMSOrder Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_AppointmentStartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Appointment Start At; Appointment Start At | `timestamp with time zone` | timestamp |
| `LineCount` | Numbering or ordering field used for display, document output or line sequencing. | Line Count | `integer(32,0)` | 32 digits, 0 dp |
| `ExpectedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Expected Quantity; quantity; qty | `numeric` |  |
| `ReceivedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Received Quantity; quantity; qty | `numeric` |  |

### `WMS_InventoryAgeing`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms inventory ageing without duplicating the underlying business data.

Purpose: Read-only view for wms inventory ageing. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBalance_ID` | WMSBalance ID field for wms inventory ageing. | WMSBalance ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBalance_FacilityID` | WMSBalance Facility ID field for wms inventory ageing. | WMSBalance Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSBalance_CustomerOrgID` | WMSBalance Customer Org ID field for wms inventory ageing. | WMSBalance Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSItem_SKU` | WMSItem SKU field for wms inventory ageing. | WMSItem SKU; SKU | `character varying(120)` | 120 chars |
| `WMSItem_Description` | Description shown in forms, grids or support screens. | WMSItem Description; Description; details | `character varying(300)` | 300 chars |
| `WMSBalance_OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance On Hand Quantity; On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_AvailableQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Available Quantity; Available Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_CustomsStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBalance Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBalance_FirstReceiptAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance First Receipt At; First Receipt At | `timestamp with time zone` | timestamp |
| `AgeDays` | Age Days field for wms inventory ageing. | Age Days | `integer(32,0)` | 32 digits, 0 dp |

### `WMS_InventorySummary`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms inventory summary without duplicating the underlying business data.

Purpose: Read-only view for wms inventory summary. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSBalance_ID` | WMSBalance ID field for wms inventory summary. | WMSBalance ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSBalance_FacilityID` | WMSBalance Facility ID field for wms inventory summary. | WMSBalance Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSFacility Code; Code; lookup code | `character varying(40)` | 40 chars |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSBalance_CustomerOrgID` | WMSBalance Customer Org ID field for wms inventory summary. | WMSBalance Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSBalance_ItemID` | WMSBalance Item ID field for wms inventory summary. | WMSBalance Item ID; Item ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSItem_SKU` | WMSItem SKU field for wms inventory summary. | WMSItem SKU; SKU | `character varying(120)` | 120 chars |
| `WMSItem_Description` | Description shown in forms, grids or support screens. | WMSItem Description; Description; details | `character varying(300)` | 300 chars |
| `WMSBalance_LocationID` | WMSBalance Location ID field for wms inventory summary. | WMSBalance Location ID; Location ID; location; place; id; UUID; record identifier | `uuid` | UUID |
| `WMSLocation_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Code; Code; lookup code | `character varying(80)` | 80 chars |
| `WMSBalance_LotID` | WMSBalance Lot ID field for wms inventory summary. | WMSBalance Lot ID; Lot ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSLot_LotNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSLot Lot Number; Lot Number; number; reference | `character varying(120)` | 120 chars |
| `WMSBalance_HU_ID` | WMSBalance HU ID field for wms inventory summary. | WMSBalance HU ID; HU ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSHU_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSHU Code; Code; lookup code | `character varying(120)` | 120 chars |
| `WMSBalance_InventoryStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBalance Inventory Status Code; Inventory Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBalance_CustomsStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSBalance Customs Status Code; Customs Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSBalance_UOMCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSBalance UOMCode; UOMCode; code; lookup code | `character varying(20)` | 20 chars |
| `WMSBalance_OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance On Hand Quantity; On Hand Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_ReservedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Reserved Quantity; Reserved Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_AllocatedQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Allocated Quantity; Allocated Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_HeldQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Held Quantity; Held Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_AvailableQuantity` | Cargo measurement used for operational, rating, customs or document output. | WMSBalance Available Quantity; Available Quantity; quantity; qty | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSBalance_IsBonded` | WMSBalance Is Bonded field for wms inventory summary. | WMSBalance Is Bonded; Is Bonded | `boolean` | true/false |
| `WMSBalance_FirstReceiptAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance First Receipt At; First Receipt At | `timestamp with time zone` | timestamp |
| `WMSBalance_LastMovementAt` | Date/time used for workflow, validity, routing or external reporting. | WMSBalance Last Movement At; Last Movement At | `timestamp with time zone` | timestamp |

### `WMS_LocationUtilisation`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms location utilisation without duplicating the underlying business data.

Purpose: Read-only view for wms location utilisation. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSLocation_ID` | WMSLocation ID field for wms location utilisation. | WMSLocation ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSLocation_FacilityID` | WMSLocation Facility ID field for wms location utilisation. | WMSLocation Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSZone_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSZone Code; Code; lookup code | `character varying(50)` | 50 chars |
| `WMSLocation_Code` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Code; Code; lookup code | `character varying(80)` | 80 chars |
| `WMSLocation_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSLocation Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSLocation_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSLocation Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSLocation_MaxWeightKG` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Max Weight KG; Max Weight KG; weight; gross weight; net weight | `numeric(18,6)` | 18 digits, 6 dp |
| `WMSLocation_MaxVolumeCBM` | Cargo measurement used for operational, rating, customs or document output. | WMSLocation Max Volume CBM; Max Volume CBM; volume; cube; CBM | `numeric(18,6)` | 18 digits, 6 dp |
| `OnHandQuantity` | Cargo measurement used for operational, rating, customs or document output. | On Hand Quantity; quantity; qty | `numeric` |  |
| `ItemCount` | Item Count field for wms location utilisation. | Item Count | `integer(32,0)` | 32 digits, 0 dp |
| `HandlingUnitCount` | Handling Unit Count field for wms location utilisation. | Handling Unit Count | `integer(32,0)` | 32 digits, 0 dp |

### `WMS_OutboundQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms outbound queue without duplicating the underlying business data.

Purpose: Read-only view for wms outbound queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSOrder_ID` | WMSOrder ID field for wms outbound queue. | WMSOrder ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_FacilityID` | WMSOrder Facility ID field for wms outbound queue. | WMSOrder Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSOrder_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSOrder Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSOrder_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSOrder Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSOrder_ReleaseGateStatusCode` | Lifecycle status for workflow, badges and filtering. | WMSOrder Release Gate Status Code; Release Gate Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSOrder_CustomerOrgID` | WMSOrder Customer Org ID field for wms outbound queue. | WMSOrder Customer Org ID; Customer Org ID; organisation; company; party; customer; client; id; UUID; record identifier | `uuid` | UUID |
| `CustomerName` | Human-readable name or title displayed to users. | Customer Name; customer; client | `character varying(100)` | 100 chars |
| `WMSOrder_JobID` | WMSOrder Job ID field for wms outbound queue. | WMSOrder Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_AppointmentStartAt` | Date/time used for workflow, validity, routing or external reporting. | WMSOrder Appointment Start At; Appointment Start At | `timestamp with time zone` | timestamp |
| `LineCount` | Numbering or ordering field used for display, document output or line sequencing. | Line Count | `integer(32,0)` | 32 digits, 0 dp |
| `OrderedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Ordered Quantity; quantity; qty | `numeric` |  |
| `AllocatedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Allocated Quantity; quantity; qty | `numeric` |  |
| `PickedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Picked Quantity; quantity; qty | `numeric` |  |
| `DispatchedQuantity` | Cargo measurement used for operational, rating, customs or document output. | Dispatched Quantity; quantity; qty | `numeric` |  |

### `WMS_TaskQueue`

Function: Read-only read model for summaries, dashboards, search, print previews, queues or comparison screens.

Reason for existence: Exists so UI, API and AI-agent reads can use a stable, query-friendly shape for wms task queue without duplicating the underlying business data.

Purpose: Read-only view for wms task queue. Use for lists, summaries, print previews or dashboards; edit the base tables instead.

AI agent guidance: Use this view to find and explain records. If the user asks to update something, trace the selected row back to the base table/API.

| Field | Purpose | AI / Natural Language Aliases | Type | Size |
|---|---|---|---|---|
| `WMSTask_ID` | WMSTask ID field for wms task queue. | WMSTask ID; ID; UUID; record identifier | `uuid` | UUID |
| `WMSTask_FacilityID` | WMSTask Facility ID field for wms task queue. | WMSTask Facility ID; Facility ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSFacility_Name` | Human-readable name or title displayed to users. | WMSFacility Name; Name | `character varying(180)` | 180 chars |
| `WMSTask_TypeCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTask Type Code; Type Code; code; lookup code | `character varying(60)` | 60 chars |
| `WMSTask_StatusCode` | Lifecycle status for workflow, badges and filtering. | WMSTask Status Code; Status Code; status; stage; code; lookup code | `character varying(60)` | 60 chars |
| `WMSTask_PriorityCode` | Code value used for lookup, external schema mapping or integration payloads. | WMSTask Priority Code; Priority Code; code; lookup code | `character varying(40)` | 40 chars |
| `WMSTask_Title` | Human-readable name or title displayed to users. | WMSTask Title; Title | `character varying(220)` | 220 chars |
| `WMSTask_OrderID` | WMSTask Order ID field for wms task queue. | WMSTask Order ID; Order ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSOrder_OrderNumber` | Numbering or ordering field used for display, document output or line sequencing. | WMSOrder Order Number; Order Number; number; reference | `character varying(80)` | 80 chars |
| `WMSTask_JobID` | WMSTask Job ID field for wms task queue. | WMSTask Job ID; Job ID; id; UUID; record identifier | `uuid` | UUID |
| `WMSTask_SourceLocationID` | Identifier of the linked source/target record. | WMSTask Source Location ID; Source Location ID; location; place; id; UUID; record identifier | `uuid` | UUID |
| `SourceLocationCode` | Code value used for lookup, external schema mapping or integration payloads. | Source Location Code; code; lookup code; location; place | `character varying(80)` | 80 chars |
| `WMSTask_TargetLocationID` | Identifier of the linked source/target record. | WMSTask Target Location ID; Target Location ID; location; place; id; UUID; record identifier | `uuid` | UUID |
| `TargetLocationCode` | Code value used for lookup, external schema mapping or integration payloads. | Target Location Code; code; lookup code; location; place | `character varying(80)` | 80 chars |
| `WMSTask_DueAt` | Date/time used for workflow, validity, routing or external reporting. | WMSTask Due At; Due At; due date; deadline | `timestamp with time zone` | timestamp |
| `WMSTask_CreatedAt` | Timestamp/date when the row was created. | WMSTask Created At; Created At; created date; created by | `timestamp with time zone` | timestamp |
