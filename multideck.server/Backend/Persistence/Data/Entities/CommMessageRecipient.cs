using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommMessageRecipient
{
    public Guid CommRecipientId { get; set; }

    public Guid CommRecipientMessageId { get; set; }

    public string CommRecipientRecipientTypeCode { get; set; } = null!;

    public string CommRecipientChannelCode { get; set; } = null!;

    public Guid? CommRecipientIdentityId { get; set; }

    public Guid? CommRecipientOrgId { get; set; }

    public Guid? CommRecipientContactId { get; set; }

    public Guid? CommRecipientUserId { get; set; }

    public string CommRecipientAddress { get; set; } = null!;

    public string CommRecipientNormalizedAddress { get; set; } = null!;

    public string? CommRecipientDisplayNameSnapshot { get; set; }

    public string? CommRecipientDeliveryStatusCode { get; set; }

    public string? CommRecipientProviderRecipientId { get; set; }

    public bool CommRecipientIsExternal { get; set; }

    public bool CommRecipientIsSuppressed { get; set; }

    public string? CommRecipientConsentStatusCode { get; set; }

    public DateTime CommRecipientCreatedAt { get; set; }

    public virtual SysCommChannel CommRecipientChannelCodeNavigation { get; set; } = null!;

    public virtual SysCommConsentStatus? CommRecipientConsentStatusCodeNavigation { get; set; }

    public virtual OrgContact? CommRecipientContact { get; set; }

    public virtual SysCommMessageStatus? CommRecipientDeliveryStatusCodeNavigation { get; set; }

    public virtual CommIdentity? CommRecipientIdentity { get; set; }

    public virtual CommMessage CommRecipientMessage { get; set; } = null!;

    public virtual OrgMaster? CommRecipientOrg { get; set; }

    public virtual SysCommRecipientType CommRecipientRecipientTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommRecipientUser { get; set; }
}
