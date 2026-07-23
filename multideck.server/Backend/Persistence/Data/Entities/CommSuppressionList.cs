using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommSuppressionList
{
    public Guid CommSuppressId { get; set; }

    public string CommSuppressChannelCode { get; set; } = null!;

    public string CommSuppressAddress { get; set; } = null!;

    public string CommSuppressNormalizedAddress { get; set; } = null!;

    public string CommSuppressStatusCode { get; set; } = null!;

    public string? CommSuppressReason { get; set; }

    public string? CommSuppressSource { get; set; }

    public DateTime? CommSuppressExpiresAt { get; set; }

    public DateTime CommSuppressCreatedAt { get; set; }

    public Guid? CommSuppressCreatedBy { get; set; }

    public virtual SysCommChannel CommSuppressChannelCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommSuppressCreatedByNavigation { get; set; }

    public virtual SysCommConsentStatus CommSuppressStatusCodeNavigation { get; set; } = null!;
}
