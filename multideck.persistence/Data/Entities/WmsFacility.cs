using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsFacility
{
    public Guid WmsfacilityId { get; set; }

    public string WmsfacilityCode { get; set; } = null!;

    public string WmsfacilityName { get; set; } = null!;

    public string WmsfacilityTypeCode { get; set; } = null!;

    public Guid? WmsfacilityOrgOfficeId { get; set; }

    public Guid? WmsfacilityOperatorOrgId { get; set; }

    public Guid? WmsfacilityOwnerOrgId { get; set; }

    public string? WmsfacilityUnlocode { get; set; }

    public string? WmsfacilityAddress1 { get; set; }

    public string? WmsfacilityAddress2 { get; set; }

    public string? WmsfacilityTownCity { get; set; }

    public string? WmsfacilityCountyState { get; set; }

    public string? WmsfacilityPostZipCode { get; set; }

    public string? WmsfacilityCountryCode { get; set; }

    public string WmsfacilityTimeZone { get; set; } = null!;

    public bool WmsfacilityIsBonded { get; set; }

    public string WmsfacilityDefaultCustomsStatusCode { get; set; } = null!;

    public string WmsfacilitySettingsJson { get; set; } = null!;

    public bool WmsfacilityIsActive { get; set; }

    public DateTime WmsfacilityCreatedAt { get; set; }

    public Guid? WmsfacilityCreatedBy { get; set; }

    public DateTime WmsfacilityUpdatedAt { get; set; }

    public Guid? WmsfacilityUpdatedBy { get; set; }

    public bool WmsfacilityIsDeleted { get; set; }

    public virtual ICollection<WmsAdjustment> WmsAdjustments { get; set; } = new List<WmsAdjustment>();

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsBondedAuthorisationSite> WmsBondedAuthorisationSites { get; set; } = new List<WmsBondedAuthorisationSite>();

    public virtual ICollection<WmsBondedAuthorisation> WmsBondedAuthorisations { get; set; } = new List<WmsBondedAuthorisation>();

    public virtual ICollection<WmsBondedDiscrepancy> WmsBondedDiscrepancies { get; set; } = new List<WmsBondedDiscrepancy>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedMovement> WmsBondedMovements { get; set; } = new List<WmsBondedMovement>();

    public virtual ICollection<WmsBondedReconciliation> WmsBondedReconciliations { get; set; } = new List<WmsBondedReconciliation>();

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();

    public virtual ICollection<WmsCustomerProfile> WmsCustomerProfiles { get; set; } = new List<WmsCustomerProfile>();

    public virtual ICollection<WmsCycleCountPlan> WmsCycleCountPlans { get; set; } = new List<WmsCycleCountPlan>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsDock> WmsDocks { get; set; } = new List<WmsDock>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();

    public virtual ICollection<WmsEquipment> WmsEquipments { get; set; } = new List<WmsEquipment>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsFacilityCapability> WmsFacilityCapabilities { get; set; } = new List<WmsFacilityCapability>();

    public virtual ICollection<WmsFacilityOffice> WmsFacilityOffices { get; set; } = new List<WmsFacilityOffice>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdvices { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsIntegrationEvent> WmsIntegrationEvents { get; set; } = new List<WmsIntegrationEvent>();

    public virtual ICollection<WmsInventoryBalance> WmsInventoryBalances { get; set; } = new List<WmsInventoryBalance>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryLot> WmsInventoryLots { get; set; } = new List<WmsInventoryLot>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventorySerial> WmsInventorySerials { get; set; } = new List<WmsInventorySerial>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsItem> WmsItems { get; set; } = new List<WmsItem>();

    public virtual ICollection<WmsKpiresult> WmsKpiresults { get; set; } = new List<WmsKpiresult>();

    public virtual ICollection<WmsLocation> WmsLocations { get; set; } = new List<WmsLocation>();

    public virtual ICollection<WmsOrder> WmsOrders { get; set; } = new List<WmsOrder>();

    public virtual ICollection<WmsPhotoEvidence> WmsPhotoEvidences { get; set; } = new List<WmsPhotoEvidence>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsScanSession> WmsScanSessions { get; set; } = new List<WmsScanSession>();

    public virtual ICollection<WmsServiceContract> WmsServiceContracts { get; set; } = new List<WmsServiceContract>();

    public virtual ICollection<WmsStorageRule> WmsStorageRules { get; set; } = new List<WmsStorageRule>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual ICollection<WmsWave> WmsWaves { get; set; } = new List<WmsWave>();

    public virtual ICollection<WmsZone> WmsZones { get; set; } = new List<WmsZone>();

    public virtual CmpUser? WmsfacilityCreatedByNavigation { get; set; }

    public virtual SysWmscustomsStatus WmsfacilityDefaultCustomsStatusCodeNavigation { get; set; } = null!;

    public virtual OrgMaster? WmsfacilityOperatorOrg { get; set; }

    public virtual CmpOffice? WmsfacilityOrgOffice { get; set; }

    public virtual OrgMaster? WmsfacilityOwnerOrg { get; set; }

    public virtual SysWmsfacilityType WmsfacilityTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WmsfacilityUpdatedByNavigation { get; set; }
}
