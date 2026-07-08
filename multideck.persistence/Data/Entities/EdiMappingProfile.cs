using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class EdiMappingProfile
{
    public Guid EdimapId { get; set; }

    public Guid EdimapMessageProfileId { get; set; }

    public string EdimapCode { get; set; } = null!;

    public string EdimapName { get; set; } = null!;

    public string EdimapStatusCode { get; set; } = null!;

    public string? EdimapCanonicalModelCode { get; set; }

    public Guid? EdimapSourceSchemaId { get; set; }

    public string? EdimapTargetSchemaRef { get; set; }

    public Guid? EdimapCurrentVersionId { get; set; }

    public bool EdimapAitrainingAllowed { get; set; }

    public string? EdimapNotes { get; set; }

    public DateTime EdimapCreatedAt { get; set; }

    public Guid? EdimapCreatedBy { get; set; }

    public DateTime EdimapUpdatedAt { get; set; }

    public Guid? EdimapUpdatedBy { get; set; }

    public virtual ICollection<EdiCodeMapping> EdiCodeMappings { get; set; } = new List<EdiCodeMapping>();

    public virtual ICollection<EdiMappingVersion> EdiMappingVersions { get; set; } = new List<EdiMappingVersion>();

    public virtual CmpUser? EdimapCreatedByNavigation { get; set; }

    public virtual EdiMappingVersion? EdimapCurrentVersion { get; set; }

    public virtual EdiMessageProfile EdimapMessageProfile { get; set; } = null!;

    public virtual EdiSchemaDefinition? EdimapSourceSchema { get; set; }

    public virtual SysEdimappingStatus EdimapStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? EdimapUpdatedByNavigation { get; set; }
}
