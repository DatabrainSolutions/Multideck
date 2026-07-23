using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdidirection
{
    public string EdidirCode { get; set; } = null!;

    public string EdidirName { get; set; } = null!;

    public string? EdidirDescription { get; set; }

    public bool EdidirIsActive { get; set; }

    public int EdidirSortOrder { get; set; }

    public virtual ICollection<EdiAcknowledgement> EdiAcknowledgements { get; set; } = new List<EdiAcknowledgement>();

    public virtual ICollection<EdiBatch> EdiBatches { get; set; } = new List<EdiBatch>();

    public virtual ICollection<EdiCodeMapping> EdiCodeMappings { get; set; } = new List<EdiCodeMapping>();

    public virtual ICollection<EdiConnection> EdiConnections { get; set; } = new List<EdiConnection>();

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiPartnerIdentifier> EdiPartnerIdentifiers { get; set; } = new List<EdiPartnerIdentifier>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual ICollection<SysEdimessageType> SysEdimessageTypes { get; set; } = new List<SysEdimessageType>();
}
