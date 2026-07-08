using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdimessageType
{
    public string EdimtCode { get; set; } = null!;

    public string EdimtName { get; set; } = null!;

    public string? EdimtDescription { get; set; }

    public string? EdimtDefaultDirectionCode { get; set; }

    public string? EdimtDefaultRecordTypeCode { get; set; }

    public bool EdimtIsFreightOperational { get; set; }

    public bool EdimtIsActive { get; set; }

    public int EdimtSortOrder { get; set; }

    public virtual ICollection<EdiMessageProfile> EdiMessageProfiles { get; set; } = new List<EdiMessageProfile>();

    public virtual ICollection<EdiMessage> EdiMessages { get; set; } = new List<EdiMessage>();

    public virtual ICollection<EdiSchemaDefinition> EdiSchemaDefinitions { get; set; } = new List<EdiSchemaDefinition>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();

    public virtual SysEdidirection? EdimtDefaultDirectionCodeNavigation { get; set; }
}
