using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsDispatch
{
    public Guid WmsdispatchId { get; set; }

    public Guid WmsdispatchFacilityId { get; set; }

    public Guid WmsdispatchOrderId { get; set; }

    public Guid? WmsdispatchJobId { get; set; }

    public string WmsdispatchDispatchNumber { get; set; } = null!;

    public string WmsdispatchStatusCode { get; set; } = null!;

    public Guid? WmsdispatchDockId { get; set; }

    public Guid? WmsdispatchCarrierOrgId { get; set; }

    public string? WmsdispatchVehicleReg { get; set; }

    public string? WmsdispatchContainerNumber { get; set; }

    public string? WmsdispatchSealNumber { get; set; }

    public DateTime? WmsdispatchDispatchedAt { get; set; }

    public Guid? WmsdispatchDispatchedBy { get; set; }

    public Guid? WmsdispatchPoddocumentId { get; set; }

    public string WmsdispatchMetadataJson { get; set; } = null!;

    public DateTime WmsdispatchCreatedAt { get; set; }

    public virtual OrgMaster? WmsdispatchCarrierOrg { get; set; }

    public virtual CmpUser? WmsdispatchDispatchedByNavigation { get; set; }

    public virtual WmsDock? WmsdispatchDock { get; set; }

    public virtual WmsFacility WmsdispatchFacility { get; set; } = null!;

    public virtual JobHeader? WmsdispatchJob { get; set; }

    public virtual WmsOrder WmsdispatchOrder { get; set; } = null!;

    public virtual JobDocument? WmsdispatchPoddocument { get; set; }
}
