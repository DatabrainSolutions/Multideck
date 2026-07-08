using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommSendRequestRecipient
{
    public Guid CommSendRecipientId { get; set; }

    public Guid CommSendRecipientSendId { get; set; }

    public string CommSendRecipientRecipientTypeCode { get; set; } = null!;

    public string CommSendRecipientChannelCode { get; set; } = null!;

    public Guid? CommSendRecipientIdentityId { get; set; }

    public string CommSendRecipientAddress { get; set; } = null!;

    public string CommSendRecipientNormalizedAddress { get; set; } = null!;

    public string? CommSendRecipientDisplayNameSnapshot { get; set; }

    public Guid? CommSendRecipientOrgId { get; set; }

    public Guid? CommSendRecipientContactId { get; set; }

    public Guid? CommSendRecipientUserId { get; set; }

    public bool CommSendRecipientIsSuppressed { get; set; }

    public string? CommSendRecipientConsentStatusCode { get; set; }

    public DateTime CommSendRecipientCreatedAt { get; set; }

    public virtual SysCommChannel CommSendRecipientChannelCodeNavigation { get; set; } = null!;

    public virtual SysCommConsentStatus? CommSendRecipientConsentStatusCodeNavigation { get; set; }

    public virtual OrgContact? CommSendRecipientContact { get; set; }

    public virtual CommIdentity? CommSendRecipientIdentity { get; set; }

    public virtual OrgMaster? CommSendRecipientOrg { get; set; }

    public virtual SysCommRecipientType CommSendRecipientRecipientTypeCodeNavigation { get; set; } = null!;

    public virtual CommSendRequest CommSendRecipientSend { get; set; } = null!;

    public virtual CmpUser? CommSendRecipientUser { get; set; }
}
