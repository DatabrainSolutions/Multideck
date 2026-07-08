using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiTradingPartner
{
    public Guid EditpId { get; set; }

    public Guid? EditpOrgId { get; set; }

    public string EditpCode { get; set; } = null!;

    public string EditpName { get; set; } = null!;

    public string EditpPartnerType { get; set; } = null!;

    public string EditpStatusCode { get; set; } = null!;

    public string? EditpDefaultStandardCode { get; set; }

    public string? EditpDefaultTransportMethodCode { get; set; }

    public string? EditpCountryCode { get; set; }

    public string? EditpTimeZone { get; set; }

    public bool EditpRequiresCertification { get; set; }

    public string? EditpNotes { get; set; }

    public string EditpMetadataJson { get; set; } = null!;

    public bool EditpIsActive { get; set; }

    public DateTime EditpCreatedAt { get; set; }

    public Guid? EditpCreatedBy { get; set; }

    public DateTime EditpUpdatedAt { get; set; }

    public Guid? EditpUpdatedBy { get; set; }

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiCertification> EdiCertifications { get; set; } = new List<EdiCertification>();

    public virtual ICollection<EdiCodeMapping> EdiCodeMappings { get; set; } = new List<EdiCodeMapping>();

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiPartnerIdentifier> EdiPartnerIdentifiers { get; set; } = new List<EdiPartnerIdentifier>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual CmpUser? EditpCreatedByNavigation { get; set; }

    public virtual SysEdistandard? EditpDefaultStandardCodeNavigation { get; set; }

    public virtual SysEditransportMethod? EditpDefaultTransportMethodCodeNavigation { get; set; }

    public virtual OrgMaster? EditpOrg { get; set; }

    public virtual SysEdiconnectionStatus EditpStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? EditpUpdatedByNavigation { get; set; }
}
