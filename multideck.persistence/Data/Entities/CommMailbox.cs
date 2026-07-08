using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMailbox
{
    public Guid CommMailboxId { get; set; }

    public Guid? CommMailboxConnectionId { get; set; }

    public string CommMailboxTypeCode { get; set; } = null!;

    public string CommMailboxChannelCode { get; set; } = null!;

    public Guid? CommMailboxOrgOfficeId { get; set; }

    public Guid? CommMailboxLegalEntityId { get; set; }

    public Guid? CommMailboxBrandId { get; set; }

    public Guid? CommMailboxUserId { get; set; }

    public Guid? CommMailboxGroupId { get; set; }

    public string CommMailboxDisplayName { get; set; } = null!;

    public string CommMailboxAddress { get; set; } = null!;

    public string CommMailboxNormalizedAddress { get; set; } = null!;

    public string? CommMailboxProviderMailboxId { get; set; }

    public bool CommMailboxIsDefaultOutbound { get; set; }

    public bool CommMailboxInboundEnabled { get; set; }

    public bool CommMailboxOutboundEnabled { get; set; }

    public string CommMailboxDefaultSensitivityCode { get; set; } = null!;

    public string? CommMailboxDefaultSignatureHtml { get; set; }

    public DateTime? CommMailboxLastSyncedAt { get; set; }

    public string? CommMailboxSyncCursor { get; set; }

    public string CommMailboxSettingsJson { get; set; } = null!;

    public DateTime CommMailboxCreatedAt { get; set; }

    public Guid? CommMailboxCreatedBy { get; set; }

    public DateTime CommMailboxUpdatedAt { get; set; }

    public Guid? CommMailboxUpdatedBy { get; set; }

    public bool CommMailboxIsDeleted { get; set; }

    public virtual ICollection<CommAiautomationPolicy> CommAiautomationPolicies { get; set; } = new List<CommAiautomationPolicy>();

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();

    public virtual CmpBrand? CommMailboxBrand { get; set; }

    public virtual SysCommChannel CommMailboxChannelCodeNavigation { get; set; } = null!;

    public virtual CommProviderConnection? CommMailboxConnection { get; set; }

    public virtual CmpUser? CommMailboxCreatedByNavigation { get; set; }

    public virtual SysCommSensitivityLevel CommMailboxDefaultSensitivityCodeNavigation { get; set; } = null!;

    public virtual CmpGroup? CommMailboxGroup { get; set; }

    public virtual CmpLegalEntity? CommMailboxLegalEntity { get; set; }

    public virtual CmpOffice? CommMailboxOrgOffice { get; set; }

    public virtual SysCommMailboxType CommMailboxTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommMailboxUpdatedByNavigation { get; set; }

    public virtual CmpUser? CommMailboxUser { get; set; }

    public virtual ICollection<CommMessage> CommMessages { get; set; } = new List<CommMessage>();

    public virtual ICollection<CommRoutingRule> CommRoutingRules { get; set; } = new List<CommRoutingRule>();

    public virtual ICollection<CommSendRequest> CommSendRequests { get; set; } = new List<CommSendRequest>();
}
