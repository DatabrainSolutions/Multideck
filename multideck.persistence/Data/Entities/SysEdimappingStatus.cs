using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysEdimappingStatus
{
    public string EdimapstCode { get; set; } = null!;

    public string EdimapstName { get; set; } = null!;

    public string? EdimapstDescription { get; set; }

    public bool EdimapstIsUsable { get; set; }

    public bool EdimapstIsFinal { get; set; }

    public bool EdimapstIsActive { get; set; }

    public int EdimapstSortOrder { get; set; }

    public virtual ICollection<EdiMappingProfile> EdiMappingProfiles { get; set; } = new List<EdiMappingProfile>();

    public virtual ICollection<EdiMappingVersion> EdiMappingVersions { get; set; } = new List<EdiMappingVersion>();

    public virtual ICollection<EdiTestCase> EdiTestCases { get; set; } = new List<EdiTestCase>();
}
