using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommProviderConnection
{
    public Guid CommConnId { get; set; }

    public string CommConnName { get; set; } = null!;

    public string CommConnProviderTypeCode { get; set; } = null!;

    public string? CommConnDefaultChannelCode { get; set; }

    public string CommConnStatusCode { get; set; } = null!;

    public Guid? CommConnOrgOfficeId { get; set; }

    public Guid? CommConnLegalEntityId { get; set; }

    public Guid? CommConnBrandId { get; set; }

    public Guid? CommConnUserId { get; set; }

    public string? CommConnAuthType { get; set; }

    public string? CommConnSecretRef { get; set; }

    public string? CommConnWebhookSecretRef { get; set; }

    public string? CommConnProviderTenantId { get; set; }

    public string? CommConnProviderAccountId { get; set; }

    public bool CommConnInboundEnabled { get; set; }

    public bool CommConnOutboundEnabled { get; set; }

    public DateTime? CommConnLastSyncAt { get; set; }

    public DateTime? CommConnNextSyncAt { get; set; }

    public string? CommConnSyncCursor { get; set; }

    public string CommConnRateLimitJson { get; set; } = null!;

    public string CommConnSettingsJson { get; set; } = null!;

    public string? CommConnErrorMessage { get; set; }

    public DateTime CommConnCreatedAt { get; set; }

    public Guid? CommConnCreatedBy { get; set; }

    public DateTime CommConnUpdatedAt { get; set; }

    public Guid? CommConnUpdatedBy { get; set; }

    public bool CommConnIsDeleted { get; set; }

    public virtual ICollection<CommCallLog> CommCallLogs { get; set; } = new List<CommCallLog>();

    public virtual CmpBrand? CommConnBrand { get; set; }

    public virtual CmpUser? CommConnCreatedByNavigation { get; set; }

    public virtual SysCommChannel? CommConnDefaultChannelCodeNavigation { get; set; }

    public virtual CmpLegalEntity? CommConnLegalEntity { get; set; }

    public virtual CmpOffice? CommConnOrgOffice { get; set; }

    public virtual SysCommProviderType CommConnProviderTypeCodeNavigation { get; set; } = null!;

    public virtual SysCommConnectionStatus CommConnStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommConnUpdatedByNavigation { get; set; }

    public virtual CmpUser? CommConnUser { get; set; }

    public virtual ICollection<CommDeliveryEvent> CommDeliveryEvents { get; set; } = new List<CommDeliveryEvent>();

    public virtual ICollection<CommFederationPeer> CommFederationPeers { get; set; } = new List<CommFederationPeer>();

    public virtual ICollection<CommInboundEvent> CommInboundEvents { get; set; } = new List<CommInboundEvent>();

    public virtual ICollection<CommMailbox> CommMailboxes { get; set; } = new List<CommMailbox>();
}
