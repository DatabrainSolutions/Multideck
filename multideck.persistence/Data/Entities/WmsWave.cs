using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsWave
{
    public Guid WmswaveId { get; set; }

    public Guid WmswaveFacilityId { get; set; }

    public string WmswaveWaveNumber { get; set; } = null!;

    public string WmswaveStatusCode { get; set; } = null!;

    public DateTime? WmswavePlannedStartAt { get; set; }

    public DateTime? WmswavePlannedEndAt { get; set; }

    public Guid? WmswaveCustomerOrgId { get; set; }

    public DateTime WmswaveCreatedAt { get; set; }

    public Guid? WmswaveCreatedBy { get; set; }

    public virtual ICollection<WmsPickTask> WmsPickTasks { get; set; } = new List<WmsPickTask>();

    public virtual CmpUser? WmswaveCreatedByNavigation { get; set; }

    public virtual OrgMaster? WmswaveCustomerOrg { get; set; }

    public virtual WmsFacility WmswaveFacility { get; set; } = null!;
}
