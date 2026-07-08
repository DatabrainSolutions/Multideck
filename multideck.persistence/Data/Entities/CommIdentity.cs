using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommIdentity
{
    public Guid CommIdentityId { get; set; }

    public string CommIdentityChannelCode { get; set; } = null!;

    public string CommIdentityAddress { get; set; } = null!;

    public string CommIdentityNormalizedAddress { get; set; } = null!;

    public string? CommIdentityDisplayName { get; set; }

    public string CommIdentityParticipantTypeCode { get; set; } = null!;

    public Guid? CommIdentityOrgId { get; set; }

    public Guid? CommIdentityContactId { get; set; }

    public Guid? CommIdentityUserId { get; set; }

    public Guid? CommIdentityFederationPeerId { get; set; }

    public string? CommIdentityCountryCodeSnapshot { get; set; }

    public string CommIdentityConsentStatusCode { get; set; } = null!;

    public DateTime? CommIdentityLastSeenAt { get; set; }

    public string? CommIdentitySource { get; set; }

    public string CommIdentityMetadataJson { get; set; } = null!;

    public DateTime CommIdentityCreatedAt { get; set; }

    public DateTime CommIdentityUpdatedAt { get; set; }

    public bool CommIdentityIsDeleted { get; set; }

    public virtual ICollection<CommCallLog> CommCallLogCommCallFromIdentities { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommCallLog> CommCallLogCommCallToIdentities { get; set; } = new List<CommCallLog>();

    public virtual ICollection<CommConsentPreference> CommConsentPreferences { get; set; } = new List<CommConsentPreference>();

    public virtual SysCommChannel CommIdentityChannelCodeNavigation { get; set; } = null!;

    public virtual SysCommConsentStatus CommIdentityConsentStatusCodeNavigation { get; set; } = null!;

    public virtual OrgContact? CommIdentityContact { get; set; }

    public virtual CommFederationPeer? CommIdentityFederationPeer { get; set; }

    public virtual OrgMaster? CommIdentityOrg { get; set; }

    public virtual SysCommParticipantType CommIdentityParticipantTypeCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommIdentityUser { get; set; }

    public virtual ICollection<CommMessageRecipient> CommMessageRecipients { get; set; } = new List<CommMessageRecipient>();

    public virtual ICollection<CommSendRequestRecipient> CommSendRequestRecipients { get; set; } = new List<CommSendRequestRecipient>();

    public virtual ICollection<CommThreadParticipant> CommThreadParticipants { get; set; } = new List<CommThreadParticipant>();
}
