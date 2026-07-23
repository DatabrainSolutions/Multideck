using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsAppointmentSlot
{
    public Guid WmsapptId { get; set; }

    public Guid WmsapptFacilityId { get; set; }

    public Guid? WmsapptDockId { get; set; }

    public Guid? WmsapptOrderId { get; set; }

    public Guid? WmsapptJobId { get; set; }

    public string WmsapptDirectionCode { get; set; } = null!;

    public string WmsapptStatusCode { get; set; } = null!;

    public DateTime WmsapptStartAt { get; set; }

    public DateTime WmsapptEndAt { get; set; }

    public Guid? WmsapptCarrierOrgId { get; set; }

    public string? WmsapptVehicleReg { get; set; }

    public string? WmsapptDriverName { get; set; }

    public string? WmsapptNotes { get; set; }

    public DateTime WmsapptCreatedAt { get; set; }

    public Guid? WmsapptCreatedBy { get; set; }

    public virtual OrgMaster? WmsapptCarrierOrg { get; set; }

    public virtual CmpUser? WmsapptCreatedByNavigation { get; set; }

    public virtual WmsDock? WmsapptDock { get; set; }

    public virtual WmsFacility WmsapptFacility { get; set; } = null!;

    public virtual JobHeader? WmsapptJob { get; set; }

    public virtual WmsOrder? WmsapptOrder { get; set; }
}
