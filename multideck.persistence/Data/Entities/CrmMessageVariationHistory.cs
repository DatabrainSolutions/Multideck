using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CrmMessageVariationHistory
{
    public Guid CrmpvarId { get; set; }

    public Guid? CrmpvarMessageDraftId { get; set; }

    public Guid? CrmpvarCommSendId { get; set; }

    public Guid? CrmpvarCustomerOrgId { get; set; }

    public Guid? CrmpvarUserId { get; set; }

    public string CrmpvarMessageIntentCode { get; set; } = null!;

    public string CrmpvarChannelCode { get; set; } = null!;

    public string CrmpvarBodyHashSha256 { get; set; } = null!;

    public string? CrmpvarBodyPreview { get; set; }

    public bool CrmpvarWasSent { get; set; }

    public DateTime? CrmpvarSentAt { get; set; }

    public DateTime CrmpvarCreatedAt { get; set; }

    public virtual SysCommChannel CrmpvarChannelCodeNavigation { get; set; } = null!;

    public virtual CommSendRequest? CrmpvarCommSend { get; set; }

    public virtual OrgMaster? CrmpvarCustomerOrg { get; set; }

    public virtual CrmPersonalMessageDraft? CrmpvarMessageDraft { get; set; }

    public virtual SysCrmmessageIntentType CrmpvarMessageIntentCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CrmpvarUser { get; set; }
}
