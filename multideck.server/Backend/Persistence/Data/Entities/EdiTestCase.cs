using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiTestCase
{
    public Guid EditestId { get; set; }

    public Guid? EditestTradingPartnerId { get; set; }

    public Guid? EditestMessageProfileId { get; set; }

    public Guid? EditestMappingVersionId { get; set; }

    public string EditestName { get; set; } = null!;

    public string EditestDirectionCode { get; set; } = null!;

    public string EditestMessageTypeCode { get; set; } = null!;

    public string EditestSamplePayloadStorageTypeCode { get; set; } = null!;

    public string? EditestSamplePayloadText { get; set; }

    public string? EditestSamplePayloadObjectRef { get; set; }

    public string EditestExpectedCanonicalJson { get; set; } = null!;

    public string EditestStatusCode { get; set; } = null!;

    public DateTime? EditestLastRunAt { get; set; }

    public DateTime EditestCreatedAt { get; set; }

    public Guid? EditestCreatedBy { get; set; }

    public virtual ICollection<EdiTestRun> EdiTestRuns { get; set; } = new List<EdiTestRun>();

    public virtual CmpUser? EditestCreatedByNavigation { get; set; }

    public virtual SysEdidirection EditestDirectionCodeNavigation { get; set; } = null!;

    public virtual EdiMappingVersion? EditestMappingVersion { get; set; }

    public virtual EdiMessageProfile? EditestMessageProfile { get; set; }

    public virtual SysEdimessageType EditestMessageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdipayloadStorageType EditestSamplePayloadStorageTypeCodeNavigation { get; set; } = null!;

    public virtual SysEdimappingStatus EditestStatusCodeNavigation { get; set; } = null!;

    public virtual EdiTradingPartner? EditestTradingPartner { get; set; }
}
