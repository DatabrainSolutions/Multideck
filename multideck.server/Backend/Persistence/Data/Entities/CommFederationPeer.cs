using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class CommFederationPeer
{
    public Guid CommPeerId { get; set; }

    public Guid? CommPeerRemoteCompanyId { get; set; }

    public string? CommPeerRemoteDatabaseId { get; set; }

    public Guid? CommPeerRemoteOrgId { get; set; }

    public string CommPeerDisplayName { get; set; } = null!;

    public string? CommPeerTradingName { get; set; }

    public string? CommPeerCountryCode { get; set; }

    public string CommPeerNetworkAddress { get; set; } = null!;

    public string? CommPeerEndpointUrl { get; set; }

    public string CommPeerStatusCode { get; set; } = null!;

    public string CommPeerTrustLevelCode { get; set; } = null!;

    public Guid? CommPeerLocalOrgId { get; set; }

    public Guid? CommPeerLocalContactId { get; set; }

    public Guid? CommPeerConnectionId { get; set; }

    public string? CommPeerPublicKeyRef { get; set; }

    public string? CommPeerRemotePublicKey { get; set; }

    public string? CommPeerSharedSecretRef { get; set; }

    public string CommPeerAllowedChannelsJson { get; set; } = null!;

    public string CommPeerPolicyJson { get; set; } = null!;

    public DateTime? CommPeerLastHandshakeAt { get; set; }

    public DateTime? CommPeerLastMessageAt { get; set; }

    public DateTime CommPeerCreatedAt { get; set; }

    public Guid? CommPeerCreatedBy { get; set; }

    public DateTime CommPeerUpdatedAt { get; set; }

    public Guid? CommPeerUpdatedBy { get; set; }

    public bool CommPeerIsDeleted { get; set; }

    public virtual ICollection<CommFederationEnvelope> CommFederationEnvelopes { get; set; } = new List<CommFederationEnvelope>();

    public virtual ICollection<CommFederationSubscription> CommFederationSubscriptions { get; set; } = new List<CommFederationSubscription>();

    public virtual ICollection<CommIdentity> CommIdentities { get; set; } = new List<CommIdentity>();

    public virtual CommProviderConnection? CommPeerConnection { get; set; }

    public virtual CmpUser? CommPeerCreatedByNavigation { get; set; }

    public virtual OrgContact? CommPeerLocalContact { get; set; }

    public virtual OrgMaster? CommPeerLocalOrg { get; set; }

    public virtual SysCommFederationStatus CommPeerStatusCodeNavigation { get; set; } = null!;

    public virtual SysCommTrustLevel CommPeerTrustLevelCodeNavigation { get; set; } = null!;

    public virtual CmpUser? CommPeerUpdatedByNavigation { get; set; }

    public virtual ICollection<MdxShareAgreement> MdxShareAgreements { get; set; } = new List<MdxShareAgreement>();

    public virtual ICollection<MdxSharedJob> MdxSharedJobs { get; set; } = new List<MdxSharedJob>();
}
