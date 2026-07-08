using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsOrder
{
    public Guid WmsorderId { get; set; }

    public Guid WmsorderFacilityId { get; set; }

    public Guid? WmsorderOrgOfficeId { get; set; }

    public Guid WmsorderCustomerOrgId { get; set; }

    public Guid? WmsorderJobId { get; set; }

    public Guid? WmsorderSourceJobLegId { get; set; }

    public Guid? WmsorderSourceJobCargoId { get; set; }

    public Guid? WmsorderSourceJobEquipmentId { get; set; }

    public string WmsorderOrderNumber { get; set; } = null!;

    public string WmsorderTypeCode { get; set; } = null!;

    public string WmsorderStatusCode { get; set; } = null!;

    public string WmsorderPriorityCode { get; set; } = null!;

    public string? WmsorderCustomerReference { get; set; }

    public string? WmsorderSupplierReference { get; set; }

    public string? WmsorderCarrierReference { get; set; }

    public Guid? WmsorderEdimessageId { get; set; }

    public Guid? WmsorderInboundFromOrgId { get; set; }

    public Guid? WmsorderOutboundToOrgId { get; set; }

    public Guid? WmsorderCarrierOrgId { get; set; }

    public DateOnly? WmsorderRequestedDate { get; set; }

    public DateTime? WmsorderAppointmentStartAt { get; set; }

    public DateTime? WmsorderAppointmentEndAt { get; set; }

    public string? WmsorderTransportModeCode { get; set; }

    public string? WmsorderVehicleReg { get; set; }

    public string? WmsorderContainerNumber { get; set; }

    public string? WmsorderSealNumber { get; set; }

    public bool WmsorderRequiresCustomsRelease { get; set; }

    public bool WmsorderRequiresComplianceRelease { get; set; }

    public bool WmsorderRequiresFinanceRelease { get; set; }

    public string WmsorderReleaseGateStatusCode { get; set; } = null!;

    public string? WmsorderInstructions { get; set; }

    public string WmsorderMetadataJson { get; set; } = null!;

    public DateTime WmsorderCreatedAt { get; set; }

    public Guid? WmsorderCreatedBy { get; set; }

    public DateTime WmsorderUpdatedAt { get; set; }

    public Guid? WmsorderUpdatedBy { get; set; }

    public bool WmsorderIsDeleted { get; set; }

    public virtual ICollection<WmsAiinsight> WmsAiinsights { get; set; } = new List<WmsAiinsight>();

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();

    public virtual ICollection<WmsBondedEntry> WmsBondedEntries { get; set; } = new List<WmsBondedEntry>();

    public virtual ICollection<WmsBondedRemoval> WmsBondedRemovals { get; set; } = new List<WmsBondedRemoval>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsDocument> WmsDocuments { get; set; } = new List<WmsDocument>();

    public virtual ICollection<WmsException> WmsExceptions { get; set; } = new List<WmsException>();

    public virtual ICollection<WmsHandlingUnit> WmsHandlingUnits { get; set; } = new List<WmsHandlingUnit>();

    public virtual ICollection<WmsInboundAdvice> WmsInboundAdvices { get; set; } = new List<WmsInboundAdvice>();

    public virtual ICollection<WmsInventoryHold> WmsInventoryHolds { get; set; } = new List<WmsInventoryHold>();

    public virtual ICollection<WmsInventoryReservation> WmsInventoryReservations { get; set; } = new List<WmsInventoryReservation>();

    public virtual ICollection<WmsInventoryTransaction> WmsInventoryTransactions { get; set; } = new List<WmsInventoryTransaction>();

    public virtual ICollection<WmsOrderLine> WmsOrderLines { get; set; } = new List<WmsOrderLine>();

    public virtual ICollection<WmsOrderParty> WmsOrderParties { get; set; } = new List<WmsOrderParty>();

    public virtual ICollection<WmsOrderReference> WmsOrderReferences { get; set; } = new List<WmsOrderReference>();

    public virtual ICollection<WmsPackTask> WmsPackTasks { get; set; } = new List<WmsPackTask>();

    public virtual ICollection<WmsPackage> WmsPackages { get; set; } = new List<WmsPackage>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual ICollection<WmsScanEvent> WmsScanEvents { get; set; } = new List<WmsScanEvent>();

    public virtual ICollection<WmsTask> WmsTasks { get; set; } = new List<WmsTask>();

    public virtual OrgMaster? WmsorderCarrierOrg { get; set; }

    public virtual CmpUser? WmsorderCreatedByNavigation { get; set; }

    public virtual OrgMaster WmsorderCustomerOrg { get; set; } = null!;

    public virtual EdiMessage? WmsorderEdimessage { get; set; }

    public virtual WmsFacility WmsorderFacility { get; set; } = null!;

    public virtual OrgMaster? WmsorderInboundFromOrg { get; set; }

    public virtual JobHeader? WmsorderJob { get; set; }

    public virtual CmpOffice? WmsorderOrgOffice { get; set; }

    public virtual OrgMaster? WmsorderOutboundToOrg { get; set; }

    public virtual SysWmsorderStatus WmsorderStatusCodeNavigation { get; set; } = null!;

    public virtual SysWmsorderType WmsorderTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? WmsorderUpdatedByNavigation { get; set; }
}
