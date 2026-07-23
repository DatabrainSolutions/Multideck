using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsEquipment
{
    public Guid WmsequipmentId { get; set; }

    public Guid WmsequipmentFacilityId { get; set; }

    public string WmsequipmentCode { get; set; } = null!;

    public string WmsequipmentName { get; set; } = null!;

    public string WmsequipmentTypeCode { get; set; } = null!;

    public string WmsequipmentStatusCode { get; set; } = null!;

    public decimal? WmsequipmentMaxWeightKg { get; set; }

    public DateOnly? WmsequipmentCertificationExpiryDate { get; set; }

    public string WmsequipmentSettingsJson { get; set; } = null!;

    public bool WmsequipmentIsActive { get; set; }

    public DateTime WmsequipmentCreatedAt { get; set; }

    public virtual ICollection<WmsTaskAssignment> WmsTaskAssignments { get; set; } = new List<WmsTaskAssignment>();

    public virtual WmsFacility WmsequipmentFacility { get; set; } = null!;
}
