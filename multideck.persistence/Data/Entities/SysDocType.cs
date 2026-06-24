using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysDocType
{
    public Guid DocTypesPk { get; set; }

    public string? DocTypesReferenceType { get; set; }

    public string? DocTypesDesc { get; set; }

    public bool? DocTypesIsPublished { get; set; }

    public bool? DocTypesIsPublishUpdatable { get; set; }

    public bool? DocTypesSaveVersions { get; set; }

    public bool? DocTypesLogSystemCreatedDocsToEdocs { get; set; }

    public DateTime? DocTypesSystemCreatedTime { get; set; }

    public Guid? DocTypesSystemCreatedBy { get; set; }

    public DateTime? DocTypesSystemLastEditedDate { get; set; }

    public Guid? DocTypesSystemLastEditedBy { get; set; }

    public string? DocTypesDocType { get; set; }

    public string? DocTypesParseType { get; set; }

    public bool? DocTypesIsDefaultPeriodic { get; set; }
}
