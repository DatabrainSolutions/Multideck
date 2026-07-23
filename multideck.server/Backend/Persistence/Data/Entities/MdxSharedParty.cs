using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class MdxSharedParty
{
    public Guid MdxpartyId { get; set; }

    public Guid MdxpartySharedJobId { get; set; }

    public Guid? MdxpartyLocalOrgId { get; set; }

    public Guid? MdxpartyLocalContactId { get; set; }

    public string? MdxpartyRemotePartyId { get; set; }

    public string MdxpartyStatusCode { get; set; } = null!;

    public string MdxpartyRoleCode { get; set; } = null!;

    public string? MdxpartyNameSnapshot { get; set; }

    public string? MdxpartyAddressSnapshot { get; set; }

    public string? MdxpartyCountryCodeSnapshot { get; set; }

    public string? MdxpartyContactNameSnapshot { get; set; }

    public string? MdxpartyEmailSnapshot { get; set; }

    public string? MdxpartyPhoneSnapshot { get; set; }

    public string? MdxpartyIdentifierType { get; set; }

    public string? MdxpartyIdentifierValueSnapshot { get; set; }

    public bool MdxpartyRequiresReview { get; set; }

    public string MdxpartyMetadataJson { get; set; } = null!;

    public DateTime MdxpartyUpdatedAt { get; set; }

    public virtual OrgContact? MdxpartyLocalContact { get; set; }

    public virtual OrgMaster? MdxpartyLocalOrg { get; set; }

    public virtual MdxSharedJob MdxpartySharedJob { get; set; } = null!;

    public virtual SysMdxrecordStatus MdxpartyStatusCodeNavigation { get; set; } = null!;
}
