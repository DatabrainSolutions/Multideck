using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsDock
{
    public Guid WmsdockId { get; set; }

    public Guid WmsdockFacilityId { get; set; }

    public Guid? WmsdockLocationId { get; set; }

    public string WmsdockCode { get; set; } = null!;

    public string? WmsdockName { get; set; }

    public string WmsdockDirectionCode { get; set; } = null!;

    public string WmsdockStatusCode { get; set; } = null!;

    public bool WmsdockAppointmentRequired { get; set; }

    public decimal? WmsdockMaxVehicleLengthM { get; set; }

    public bool WmsdockIsActive { get; set; }

    public DateTime WmsdockCreatedAt { get; set; }

    public virtual ICollection<WmsAppointmentSlot> WmsAppointmentSlots { get; set; } = new List<WmsAppointmentSlot>();

    public virtual ICollection<WmsDispatch> WmsDispatches { get; set; } = new List<WmsDispatch>();

    public virtual ICollection<WmsReceipt> WmsReceipts { get; set; } = new List<WmsReceipt>();

    public virtual WmsFacility WmsdockFacility { get; set; } = null!;

    public virtual WmsLocation? WmsdockLocation { get; set; }

    public virtual SysWmslocationStatus WmsdockStatusCodeNavigation { get; set; } = null!;
}
