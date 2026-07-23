using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class AiConversationParticipant
{
    public Guid AicnpId { get; set; }

    public Guid AicnpConversationId { get; set; }

    public string AicnpParticipantType { get; set; } = null!;

    public Guid? AicnpUserId { get; set; }

    public Guid? AicnpOrgId { get; set; }

    public Guid? AicnpUserRoleId { get; set; }

    public string? AicnpDisplayNameSnapshot { get; set; }

    public bool AicnpIsPrimary { get; set; }

    public DateTime AicnpCreatedAt { get; set; }

    public virtual AiConversation AicnpConversation { get; set; } = null!;

    public virtual CmpUser? AicnpUser { get; set; }

    public virtual SysUserRole? AicnpUserRole { get; set; }
}
