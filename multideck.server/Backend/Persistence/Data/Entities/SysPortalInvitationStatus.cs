using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysPortalInvitationStatus
{
    public string PortalInviteStatusCode { get; set; } = null!;

    public string PortalInviteStatusName { get; set; } = null!;

    public string? PortalInviteStatusDescription { get; set; }

    public bool PortalInviteStatusIsFinal { get; set; }

    public int PortalInviteStatusSortOrder { get; set; }

    public virtual ICollection<PortalInvitation> PortalInvitations { get; set; } = new List<PortalInvitation>();
}
