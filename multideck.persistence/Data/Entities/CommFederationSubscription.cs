using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommFederationSubscription
{
    public Guid CommFedSubId { get; set; }

    public Guid CommFedSubPeerId { get; set; }

    public string? CommFedSubLocalTargetTable { get; set; }

    public Guid? CommFedSubLocalTargetId { get; set; }

    public string? CommFedSubRemoteTargetTable { get; set; }

    public Guid? CommFedSubRemoteTargetId { get; set; }

    public string? CommFedSubLinkTypeCode { get; set; }

    public string CommFedSubStatusCode { get; set; } = null!;

    public string CommFedSubDirectionCode { get; set; } = null!;

    public string CommFedSubPermissionsJson { get; set; } = null!;

    public DateTime? CommFedSubLastSyncedAt { get; set; }

    public DateTime CommFedSubCreatedAt { get; set; }

    public Guid? CommFedSubCreatedBy { get; set; }

    public virtual CmpUser? CommFedSubCreatedByNavigation { get; set; }

    public virtual SysCommDirection CommFedSubDirectionCodeNavigation { get; set; } = null!;

    public virtual SysCommLinkType? CommFedSubLinkTypeCodeNavigation { get; set; }

    public virtual CommFederationPeer CommFedSubPeer { get; set; } = null!;

    public virtual SysCommFederationStatus CommFedSubStatusCodeNavigation { get; set; } = null!;
}
