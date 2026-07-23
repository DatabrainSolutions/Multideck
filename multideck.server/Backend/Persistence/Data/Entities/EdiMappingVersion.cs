using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMappingVersion
{
    public Guid EdimvId { get; set; }

    public Guid EdimvMappingProfileId { get; set; }

    public int EdimvVersionNo { get; set; }

    public string EdimvStatusCode { get; set; } = null!;

    public string EdimvTransformLanguage { get; set; } = null!;

    public string EdimvMappingJson { get; set; } = null!;

    public string EdimvTestResultJson { get; set; } = null!;

    public DateTime? EdimvEffectiveFrom { get; set; }

    public DateTime? EdimvEffectiveTo { get; set; }

    public DateTime EdimvCreatedAt { get; set; }

    public Guid? EdimvCreatedBy { get; set; }

    public virtual ICollection<EdiCertification> EdiCertifications { get; set; } = new List<EdiCertification>();

    public virtual ICollection<EdiMappingProfile> EdiMappingProfiles { get; set; } = new List<EdiMappingProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual ICollection<EdiValidationIssue> EdiValidationIssues { get; set; } = new List<EdiValidationIssue>();

    public virtual CmpUser? EdimvCreatedByNavigation { get; set; }

    public virtual EdiMappingProfile EdimvMappingProfile { get; set; } = null!;

    public virtual SysEdimappingStatus EdimvStatusCodeNavigation { get; set; } = null!;
}
