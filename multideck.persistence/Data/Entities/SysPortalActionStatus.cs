using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalActionStatus
{
    public string PortalActionStatusCode { get; set; } = null!;

    public string PortalActionStatusName { get; set; } = null!;

    public string? PortalActionStatusDescription { get; set; }

    public bool PortalActionStatusIsFinal { get; set; }

    public int PortalActionStatusSortOrder { get; set; }

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();

    public virtual ICollection<PortalActionResponse> PortalActionResponses { get; set; } = new List<PortalActionResponse>();
}
