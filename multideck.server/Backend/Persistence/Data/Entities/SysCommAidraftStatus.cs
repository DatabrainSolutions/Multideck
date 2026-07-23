using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysCommAidraftStatus
{
    public string CommAidraftStatusCode { get; set; } = null!;

    public string CommAidraftStatusName { get; set; } = null!;

    public string? CommAidraftStatusDescription { get; set; }

    public bool CommAidraftStatusIsFinal { get; set; }

    public int CommAidraftStatusSortOrder { get; set; }

    public bool CommAidraftStatusIsActive { get; set; }

    public DateTime CommAidraftStatusCreatedAt { get; set; }

    public virtual ICollection<CommAidraftResponse> CommAidraftResponses { get; set; } = new List<CommAidraftResponse>();
}
