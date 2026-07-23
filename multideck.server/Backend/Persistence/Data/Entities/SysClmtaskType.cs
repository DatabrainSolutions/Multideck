using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysClmtaskType
{
    public string ClmtaskTypeCode { get; set; } = null!;

    public string ClmtaskTypeName { get; set; } = null!;

    public string? ClmtaskTypeDescription { get; set; }

    public bool ClmtaskTypeIsActive { get; set; }

    public int ClmtaskTypeSortOrder { get; set; }

    public virtual ICollection<ClmClaimTask> ClmClaimTasks { get; set; } = new List<ClmClaimTask>();

    public virtual ICollection<ClmIncidentAction> ClmIncidentActions { get; set; } = new List<ClmIncidentAction>();
}
