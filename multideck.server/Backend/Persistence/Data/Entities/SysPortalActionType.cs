using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalActionType
{
    public string PortalActionTypeCode { get; set; } = null!;

    public string PortalActionTypeName { get; set; } = null!;

    public string? PortalActionTypeDescription { get; set; }

    public bool PortalActionTypeDefaultRequiresInternalReview { get; set; }

    public int PortalActionTypeSortOrder { get; set; }

    public virtual ICollection<PortalActionRequest> PortalActionRequests { get; set; } = new List<PortalActionRequest>();
}
